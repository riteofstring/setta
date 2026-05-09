package statemachineruns

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"setta/internal/agentruns"
	"setta/internal/managedchat"
	"setta/internal/projectstate"
	"setta/internal/prompttemplates"
)

type recordingManagedChatStarter struct {
	mu       sync.Mutex
	chatIDs  []string
	runIDs   []string
	requests []managedchat.StartChatRequest
	calls    int
	runs     *agentruns.RunStore
}

func (s *recordingManagedChatStarter) StartChat(request managedchat.StartChatRequest) (managedchat.StartChatResult, error) {
	s.mu.Lock()
	s.requests = append(s.requests, request)
	index := s.calls
	s.calls++
	s.mu.Unlock()
	chatID := s.nextChatID(index)
	if request.ChatID != nil && strings.TrimSpace(*request.ChatID) != "" {
		chatID = strings.TrimSpace(*request.ChatID)
	}
	runID := s.nextRunID(index)
	run := agentruns.NewRun(nil, map[string]any{
		"runType":         managedchat.RunTypeManagedChat,
		"projectConfigId": request.ProjectConfigID,
		"chatId":          chatID,
		"sectionId":       derefOptionalString(request.SectionID),
		"engineConfigId":  request.EngineConfigID,
	}, testNow())
	run.ID = runID
	if run.Inputs == nil {
		run.Inputs = map[string]any{}
	}
	for key, value := range request.AdditionalInputs {
		run.Inputs[key] = value
	}
	if s.runs != nil {
		if err := s.runs.Save(run); err != nil {
			return managedchat.StartChatResult{}, err
		}
	}
	return managedchat.StartChatResult{
		ChatID: chatID,
		Run:    run,
	}, nil
}

func (s *recordingManagedChatStarter) nextChatID(index int) string {
	if index >= 0 && index < len(s.chatIDs) && s.chatIDs[index] != "" {
		return s.chatIDs[index]
	}
	return "chat-managed"
}

func (s *recordingManagedChatStarter) nextRunID(index int) string {
	if index >= 0 && index < len(s.runIDs) && s.runIDs[index] != "" {
		return s.runIDs[index]
	}
	return "child-run"
}

type recordingRunStopper struct {
	mu      sync.Mutex
	stopped []string
}

func (s *recordingRunStopper) StopRun(runID string) (agentruns.Run, error) {
	s.mu.Lock()
	s.stopped = append(s.stopped, runID)
	s.mu.Unlock()
	run := agentruns.NewRun(nil, map[string]any{}, testNow())
	run.ID = runID
	run.Status = agentruns.RunStatusCancelled
	return run, nil
}

type blockingManagedChatStarter struct {
	mu             sync.Mutex
	startedTwo     chan struct{}
	startedTwoOnce sync.Once
	chatIDs        []string
	runIDs         []string
	calls          int
	requests       []managedchat.StartChatRequest
}

func newBlockingManagedChatStarter() *blockingManagedChatStarter {
	return &blockingManagedChatStarter{
		startedTwo: make(chan struct{}),
		chatIDs:    []string{"chat-managed-1", "chat-managed-2"},
		runIDs:     []string{"child-run-1", "child-run-2"},
	}
}

func (s *blockingManagedChatStarter) StartChat(request managedchat.StartChatRequest) (managedchat.StartChatResult, error) {
	s.mu.Lock()
	s.requests = append(s.requests, request)
	index := s.calls
	s.calls++
	if s.calls == 2 {
		s.startedTwoOnce.Do(func() {
			close(s.startedTwo)
		})
	}
	s.mu.Unlock()

	if index == 0 {
		select {
		case <-s.startedTwo:
		case <-time.After(2 * time.Second):
			return managedchat.StartChatResult{}, errors.New("timed out waiting for parallel start-edge chat dispatch")
		}
	}

	run := agentruns.NewRun(nil, map[string]any{
		"runType":         managedchat.RunTypeManagedChat,
		"projectConfigId": request.ProjectConfigID,
		"chatId":          s.chatIDs[index],
		"sectionId":       derefOptionalString(request.SectionID),
		"engineConfigId":  request.EngineConfigID,
	}, testNow())
	run.ID = s.runIDs[index]
	return managedchat.StartChatResult{
		ChatID: s.chatIDs[index],
		Run:    run,
	}, nil
}

func managedRequestText(t *testing.T, request managedchat.StartChatRequest) string {
	t.Helper()

	rawContent, ok := request.Message["content"].([]any)
	if !ok || len(rawContent) == 0 {
		t.Fatalf("expected workflow message content array, got %#v", request.Message)
	}
	textPart, ok := rawContent[0].(map[string]any)
	if !ok {
		t.Fatalf("expected workflow message content entry, got %#v", rawContent[0])
	}
	text, ok := textPart["text"].(string)
	if !ok {
		t.Fatalf("expected workflow message text, got %#v", textPart)
	}
	return text
}

func TestRuntimeStartRunDispatchesManagedChatAndPersistsParentState(t *testing.T) {
	t.Parallel()

	fixture := newRuntimeFixture(t)

	run, err := fixture.runtime.StartRun("project-alpha", "workflow-a", nil, nil)
	if err != nil {
		t.Fatalf("StartRun returned error: %v", err)
	}
	assertStartedManagedChatParentRun(t, run)
	assertStartedManagedChatChildRun(t, fixture, run.ID)
	assertStartedManagedChatBindingAndEvents(t, fixture, run)
}

func assertStartedManagedChatParentRun(t *testing.T, run agentruns.Run) {
	t.Helper()

	if run.Status != agentruns.RunStatusRunning {
		t.Fatalf("expected running parent run, got %#v", run)
	}
	if runInputString(run, "runType") != RunTypeStateMachine {
		t.Fatalf("expected state machine run type, got %#v", run.Inputs)
	}
	if _, ok := run.Inputs[graphSnapshotInputKey]; !ok {
		t.Fatalf("expected graph snapshot input on parent run, got %#v", run.Inputs)
	}
	if got := outputStringList(run, outputKeyChildRunIDs); len(got) != 1 || got[0] != "child-run-1" {
		t.Fatalf("expected child run tracking, got %#v", got)
	}
	if got := outputStringList(run, outputKeyActiveChildRunIDs); len(got) != 1 || got[0] != "child-run-1" {
		t.Fatalf("expected active child run tracking, got %#v", got)
	}
	if got := outputStringList(run, outputKeyActivatedEdgeIDs); len(got) != 1 || got[0] != "edge-start-chat" {
		t.Fatalf("expected activated start edge, got %#v", got)
	}
	if got := outputMap(run, outputKeyOwnedChatBindings)["chat-section"]; got != "chat-managed-1" {
		t.Fatalf("expected owned chat binding, got %#v", outputMap(run, outputKeyOwnedChatBindings))
	}
}

func assertStartedManagedChatChildRun(t *testing.T, fixture runtimeFixture, parentRunID string) {
	t.Helper()

	if len(fixture.managedStarter.requests) != 1 {
		t.Fatalf("expected one managed chat request, got %d", len(fixture.managedStarter.requests))
	}
	childRun, err := fixture.runs.Load("child-run-1")
	if err != nil {
		t.Fatalf("load child run: %v", err)
	}
	if runInputString(childRun, inputKeyStateMachineRunID) != parentRunID {
		t.Fatalf("expected child run parent id %q, got %#v", parentRunID, childRun.Inputs)
	}
	if runInputString(childRun, inputKeyStateMachineTargetSection) != "chat-section" {
		t.Fatalf("expected child run target section metadata, got %#v", childRun.Inputs)
	}
}

func assertStartedManagedChatBindingAndEvents(t *testing.T, fixture runtimeFixture, run agentruns.Run) {
	t.Helper()

	chatID, err := fixture.projectRuntime.ChatSectionChatID("project-alpha", "chat-section")
	if err != nil {
		t.Fatalf("ChatSectionChatID returned error: %v", err)
	}
	if chatID == nil || *chatID != "chat-managed-1" {
		t.Fatalf("expected chat-section chat id chat-managed-1, got %#v", chatID)
	}
	if got := eventTypes(run); !slices.Equal(got, []string{
		"run_started",
		"graph_resolved",
		"start_edges_activated",
		"start_edge_action_dispatched",
		"start_edge_actions_dispatched",
	}) {
		t.Fatalf("expected start dispatch event sequence, got %#v", got)
	}
}

func TestRuntimeStartRunResetThreadClearsChatAndStopsRunningRun(t *testing.T) {
	t.Parallel()

	project := stateMachineRuntimeTestProject(t)
	project.StateMachineEdges[0].TargetAction = &projectstate.StateMachineTargetAction{
		Type:          projectstate.StateMachineTargetActionTypeResetThread,
		StopIfRunning: true,
	}
	fixture := newSignalRuntimeFixtureForProjectWithProfiles(
		t,
		project,
		nil,
		[]string{"chat-managed-1"},
		[]string{"child-run-1"},
	)

	if _, err := fixture.projectRuntime.SetChatSectionChatID(context.Background(), "project-alpha", "chat-section", stringPointer("chat-reset-target")); err != nil {
		t.Fatalf("seed chat-section chat id: %v", err)
	}
	existingRun := agentruns.NewRun(nil, map[string]any{
		"runType":         managedchat.RunTypeManagedChat,
		"chatId":          "chat-reset-target",
		"projectConfigId": "project-alpha",
		"engineConfigId":  "engine-managed",
	}, testNow())
	existingRun.ID = "existing-chat-run"
	existingRun.Status = agentruns.RunStatusRunning
	if err := fixture.runs.Save(existingRun); err != nil {
		t.Fatalf("save running chat run: %v", err)
	}

	run, err := fixture.runtime.StartRun("project-alpha", "workflow-a", nil, nil)
	if err != nil {
		t.Fatalf("StartRun returned error: %v", err)
	}
	if got := fixture.managedStopper.stopped; !slices.Equal(got, []string{"existing-chat-run"}) {
		t.Fatalf("expected running chat cancellation for reset_thread, got %#v", got)
	}
	chatID, err := fixture.projectRuntime.ChatSectionChatID("project-alpha", "chat-section")
	if err != nil {
		t.Fatalf("ChatSectionChatID returned error: %v", err)
	}
	if chatID != nil {
		t.Fatalf("expected cleared chat-section chat id, got %#v", chatID)
	}
	if got := outputListOfMaps(run, outputKeyDispatchedStartActions); len(got) != 1 {
		t.Fatalf("expected one reset_thread dispatched action, got %#v", got)
	} else if !slices.Equal(eventTypes(run), []string{
		"run_started",
		"graph_resolved",
		"start_edges_activated",
		"start_edge_action_reset",
		"start_edge_actions_dispatched",
	}) {
		t.Fatalf("expected reset_thread start events, got %#v", eventTypes(run))
	} else {
		if len(got[0]) != 5 {
			t.Fatalf("expected five reset_thread action fields, got %#v", got[0])
		}
		if got[0]["edgeId"] != "edge-start-chat" || got[0]["actionType"] != "reset_thread" || got[0]["targetSectionId"] != "chat-section" {
			t.Fatalf("unexpected reset_thread action identity, got %#v", got[0])
		}
		if got[0]["clearedChatId"] != "chat-reset-target" || got[0]["stoppedRunId"] != "existing-chat-run" {
			t.Fatalf("unexpected reset_thread action metadata, got %#v", got[0])
		}
	}
	if got := outputMap(run, outputKeyOwnedChatBindings); len(got) != 0 {
		t.Fatalf("expected no owned chat binding after reset_thread, got %#v", got)
	}
}

func TestRuntimeStopChatIfRunningStopsLatestRunningManagedRun(t *testing.T) {
	t.Parallel()

	fixture := newRuntimeFixture(t)

	olderRun := agentruns.NewRun(nil, map[string]any{
		"runType":         managedchat.RunTypeManagedChat,
		"chatId":          "chat-managed",
		"projectConfigId": "project-alpha",
		"engineConfigId":  "engine-managed",
	}, testNow().Add(-2*time.Minute))
	olderRun.ID = "existing-chat-run-older"
	olderRun.Status = agentruns.RunStatusRunning
	if err := fixture.runs.Save(olderRun); err != nil {
		t.Fatalf("save older running chat run: %v", err)
	}

	newerRun := agentruns.NewRun(nil, map[string]any{
		"runType":         managedchat.RunTypeManagedChat,
		"chatId":          "chat-managed",
		"projectConfigId": "project-alpha",
		"engineConfigId":  "engine-managed",
	}, testNow().Add(-1*time.Minute))
	newerRun.ID = "existing-chat-run-newer"
	newerRun.Status = agentruns.RunStatusRunning
	if err := fixture.runs.Save(newerRun); err != nil {
		t.Fatalf("save newer running chat run: %v", err)
	}

	stopped := fixture.runtime.stopChatIfRunning("chat-managed", "project-alpha")
	if stopped == nil {
		t.Fatal("expected latest running chat run to be stopped")
	}
	if stopped.ID != "existing-chat-run-newer" {
		t.Fatalf("expected newer run to stop, got %#v", stopped)
	}
	if got := fixture.managedStopper.stopped; !slices.Equal(got, []string{"existing-chat-run-newer"}) {
		t.Fatalf("expected newest running managed run to be stopped, got %#v", got)
	}
}

func TestRuntimeStartRunDispatchesPromptSectionWithEdgeBindings(t *testing.T) {
	t.Parallel()

	fixture := newPromptSectionRuntimeFixture(t, promptSectionStartRuntimeTestProject(
		t,
		nil,
		"Hi my name is {{ name }}. What's your name?",
		map[string]string{"name": "Kevin"},
	))

	run, err := fixture.runtime.StartRun("project-alpha", "workflow-prompt-section", nil, nil)
	if err != nil {
		t.Fatalf("StartRun returned error: %v", err)
	}
	if run.Status != agentruns.RunStatusRunning {
		t.Fatalf("expected running workflow run, got %#v", run)
	}
	if len(fixture.managedStarter.requests) != 1 {
		t.Fatalf("expected one managed chat dispatch, got %#v", fixture.managedStarter.requests)
	}
	request := fixture.managedStarter.requests[0]
	if got := managedRequestText(t, request); got != "Hi my name is Kevin. What's your name?" {
		t.Fatalf("expected rendered prompt-section message, got %q", got)
	}
	if got := request.AdditionalInputs[inputKeyStateMachineTargetSection]; got != "chat-section" {
		t.Fatalf("expected target section metadata for chat-section, got %#v", request.AdditionalInputs)
	}
}

func TestRuntimeStartRunDispatchesLiveLinkedPromptSectionContent(t *testing.T) {
	t.Parallel()

	templateID := "prompt-template-1"
	fixture := newPromptSectionRuntimeFixture(t, promptSectionStartRuntimeTestProject(
		t,
		&templateID,
		"Hi my name is {{ name }}. What's your name?",
		nil,
	))
	_, updated, err := fixture.projectRuntime.RefreshLinkedPromptSectionsForTemplate(
		context.Background(),
		templateID,
		"Hello there.",
		prompttemplates.FormatJinja,
	)
	if err != nil {
		t.Fatalf("RefreshLinkedPromptSectionsForTemplate returned error: %v", err)
	}
	if !updated {
		t.Fatal("expected linked prompt refresh to update the cached prompt section")
	}

	run, err := fixture.runtime.StartRun("project-alpha", "workflow-prompt-section", nil, nil)
	if err != nil {
		t.Fatalf("StartRun returned error: %v", err)
	}
	if run.Status != agentruns.RunStatusRunning {
		t.Fatalf("expected running workflow run, got %#v", run)
	}
	if len(fixture.managedStarter.requests) != 1 {
		t.Fatalf("expected one managed chat dispatch, got %#v", fixture.managedStarter.requests)
	}
	request := fixture.managedStarter.requests[0]
	if got := managedRequestText(t, request); got != "Hello there." {
		t.Fatalf("expected refreshed linked prompt content, got %q", got)
	}
	if got := request.AdditionalInputs[inputKeyStateMachineTargetSection]; got != "chat-section" {
		t.Fatalf("expected target section metadata for chat-section, got %#v", request.AdditionalInputs)
	}
}

func TestRuntimeStartRunFansOutStartChatEdgeGroupsInParallel(t *testing.T) {
	t.Parallel()

	fixture := newParallelStartRuntimeFixture(t)
	run, err := fixture.runtime.StartRun("project-alpha", "workflow-parallel", nil, nil)
	if err != nil {
		t.Fatalf("StartRun returned error: %v", err)
	}
	if run.Status != agentruns.RunStatusRunning {
		t.Fatalf("expected running parent run, got %#v", run)
	}
	if len(fixture.parallelStarter.requests) != 2 {
		t.Fatalf("expected two managed chat requests, got %#v", fixture.parallelStarter.requests)
	}
	select {
	case <-fixture.parallelStarter.startedTwo:
	default:
		t.Fatal("expected second managed chat dispatch to begin before the first completed")
	}
	if got := outputStringList(run, outputKeyChildRunIDs); !sameStringMembers(got, []string{"child-run-1", "child-run-2"}) {
		t.Fatalf("expected both child run ids, got %#v", got)
	}
	if got := outputStringList(run, outputKeyActiveChildRunIDs); !sameStringMembers(got, []string{"child-run-1", "child-run-2"}) {
		t.Fatalf("expected both child runs to stay active, got %#v", got)
	}
	if got := outputListOfMaps(run, outputKeyDispatchedStartActions); len(got) != 2 {
		t.Fatalf("expected two dispatched start actions, got %#v", got)
	}
}

func TestRuntimeHandleTerminalChildRunUpdateCompletesParentRun(t *testing.T) {
	t.Parallel()

	fixture := newRuntimeFixture(t)
	parentRun, err := fixture.runtime.StartRun("project-alpha", "workflow-a", nil, nil)
	if err != nil {
		t.Fatalf("StartRun returned error: %v", err)
	}

	childRun, err := fixture.runs.Load("child-run-1")
	if err != nil {
		t.Fatalf("load child run: %v", err)
	}
	childRun.Status = agentruns.RunStatusCompleted
	if err := fixture.runs.Save(childRun); err != nil {
		t.Fatalf("save completed child run: %v", err)
	}

	updated, err := fixture.runtime.HandleTerminalChildRunUpdate(childRun)
	if err != nil {
		t.Fatalf("HandleTerminalChildRunUpdate returned error: %v", err)
	}
	if updated == nil {
		t.Fatal("expected updated parent run")
	}
	if updated.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed parent run, got %#v", updated)
	}
	if got := outputStringList(*updated, outputKeyActiveChildRunIDs); len(got) != 0 {
		t.Fatalf("expected no active child runs, got %#v", got)
	}
	if got := outputStringList(*updated, outputKeyReachedEndSectionIDs); len(got) != 1 || got[0] != "end-section" {
		t.Fatalf("expected reached end tracking, got %#v", got)
	}
	if got := outputMap(*updated, outputKeyGateStatuses)["gate-section"]; got != "satisfied" {
		t.Fatalf("expected satisfied gate status, got %#v", outputMap(*updated, outputKeyGateStatuses))
	}
	if !hasEventType(*updated, "run_completed") {
		t.Fatalf("expected run_completed event, got %#v", updated.Events)
	}
	if updated.ID != parentRun.ID {
		t.Fatalf("expected same parent run id %q, got %q", parentRun.ID, updated.ID)
	}
}

func TestRuntimeStartRunRejectsMachineGroupWithoutEndSection(t *testing.T) {
	t.Parallel()

	fixture := newSignalRuntimeFixtureForProjectWithProfiles(
		t,
		startOnlyRuntimeTestProject(t),
		nil,
		[]string{"chat-managed-1"},
		[]string{"child-run-1"},
	)

	_, err := fixture.runtime.StartRun("project-alpha", "workflow-start-only", nil, nil)
	if !errors.Is(err, ErrInvalidStateMachineInput) {
		t.Fatalf("expected typed invalid workflow input, got %v", err)
	}
	if !strings.Contains(err.Error(), "at least one End section") {
		t.Fatalf("expected missing-end detail, got %v", err)
	}
}

func TestRuntimeHandleTerminalChildRunUpdateWaitsForAllCompletedChildrenBeforeANDGateFires(t *testing.T) {
	t.Parallel()

	fixture := newSignalRuntimeFixtureForProjectWithProfiles(
		t,
		gateRuntimeTestProject(t, "workflow-gate-and", projectstate.StateMachineGateTypeAND, []string{"chat-a", "chat-b"}, nil),
		nil,
		[]string{"chat-managed-1", "chat-managed-2"},
		[]string{"child-run-1", "child-run-2"},
	)

	_, err := fixture.runtime.StartRun("project-alpha", "workflow-gate-and", nil, nil)
	if err != nil {
		t.Fatalf("StartRun returned error: %v", err)
	}

	firstChildRun := setChildRunStatus(t, fixture, "child-run-1", agentruns.RunStatusCompleted)
	waiting, err := fixture.runtime.HandleTerminalChildRunUpdate(firstChildRun)
	if err != nil {
		t.Fatalf("HandleTerminalChildRunUpdate returned error: %v", err)
	}
	if waiting == nil {
		t.Fatal("expected updated parent run after first completion")
	}
	if waiting.Status != agentruns.RunStatusRunning {
		t.Fatalf("expected running parent run while AND gate waits, got %#v", waiting)
	}
	if got := outputMap(*waiting, outputKeyGateStatuses)["gate-section"]; got != "waiting" {
		t.Fatalf("expected waiting gate status, got %#v", outputMap(*waiting, outputKeyGateStatuses))
	}
	if got := outputStringList(*waiting, outputKeyFiredGateSectionIDs); len(got) != 0 {
		t.Fatalf("expected no fired gates after first completion, got %#v", got)
	}
	if got := outputStringList(*waiting, outputKeyReachedEndSectionIDs); len(got) != 0 {
		t.Fatalf("expected no reached ends while gate waits, got %#v", got)
	}

	secondChildRun := setChildRunStatus(t, fixture, "child-run-2", agentruns.RunStatusCompleted)
	completed, err := fixture.runtime.HandleTerminalChildRunUpdate(secondChildRun)
	if err != nil {
		t.Fatalf("HandleTerminalChildRunUpdate returned error: %v", err)
	}
	if completed == nil {
		t.Fatal("expected updated parent run after second completion")
	}
	if completed.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed parent run after AND gate satisfaction, got %#v", completed)
	}
	if got := outputStringList(*completed, outputKeyProcessedChildTerminalIDs); !slices.Equal(got, []string{"child-run-1", "child-run-2"}) {
		t.Fatalf("expected both processed child terminal ids, got %#v", got)
	}
	if got := outputStringList(*completed, outputKeyFiredGateSectionIDs); !slices.Equal(got, []string{"gate-section"}) {
		t.Fatalf("expected fired gate-section output, got %#v", got)
	}
	if got := outputMap(*completed, outputKeyGateStatuses)["gate-section"]; got != "satisfied" {
		t.Fatalf("expected satisfied gate status, got %#v", outputMap(*completed, outputKeyGateStatuses))
	}
	if got := outputStringList(*completed, outputKeyReachedEndSectionIDs); !slices.Equal(got, []string{"end-section"}) {
		t.Fatalf("expected end-section reached output, got %#v", got)
	}
	if got := eventTypes(*completed); !slices.Equal(got[len(got)-6:], []string{
		"child_run_completed",
		"child_run_edges_activated",
		"gate_input_activated",
		"gate_satisfied",
		"end_reached",
		"run_completed",
	}) {
		t.Fatalf("expected AND gate completion event tail, got %#v", got)
	}
}

func TestRuntimeHandleTerminalChildRunUpdateTracksAllANDGateInputsForThreeChatCompletions(t *testing.T) {
	t.Parallel()

	fixture := newSignalRuntimeFixtureForProjectWithProfiles(
		t,
		gateRuntimeTestProject(t, "workflow-gate-three", projectstate.StateMachineGateTypeAND, []string{"chat-a", "chat-b", "chat-c"}, nil),
		nil,
		[]string{"chat-managed-1", "chat-managed-2", "chat-managed-3"},
		[]string{"child-run-1", "child-run-2", "child-run-3"},
	)

	_, err := fixture.runtime.StartRun("project-alpha", "workflow-gate-three", nil, nil)
	if err != nil {
		t.Fatalf("StartRun returned error: %v", err)
	}

	firstGateEdgeID, _ := completeGateChildAndAssertInputs(t, fixture, "child-run-1", nil, "first")
	secondGateEdgeID, _ := completeGateChildAndAssertInputs(t, fixture, "child-run-2", []string{firstGateEdgeID}, "second")
	thirdGateEdgeID, afterThird := completeGateChildAndAssertInputs(t, fixture, "child-run-3", []string{firstGateEdgeID, secondGateEdgeID}, "third")
	assertThreeInputANDGateCompletion(t, *afterThird, []string{firstGateEdgeID, secondGateEdgeID, thirdGateEdgeID})
}

func completeGateChildAndAssertInputs(
	t *testing.T,
	fixture runtimeFixture,
	childRunID string,
	previousGateEdgeIDs []string,
	label string,
) (string, *agentruns.Run) {
	t.Helper()

	updated, err := fixture.runtime.HandleTerminalChildRunUpdate(setChildRunStatus(t, fixture, childRunID, agentruns.RunStatusCompleted))
	if err != nil {
		t.Fatalf("HandleTerminalChildRunUpdate returned error: %v", err)
	}
	if updated == nil {
		t.Fatalf("expected updated parent run after %s completion", label)
	}
	childRun, err := fixture.runs.Load(childRunID)
	if err != nil {
		t.Fatalf("load %s child run: %v", label, err)
	}
	gateEdgeID := fmt.Sprintf("edge-%s-gate", runInputString(childRun, inputKeyStateMachineTargetSection))
	expectedGateEdgeIDs := append(append([]string(nil), previousGateEdgeIDs...), gateEdgeID)
	gateInputs, ok := rawOutputMap(*updated, outputKeyGateInputEdgeIDs)["gate-section"].([]any)
	if !ok || !sameStringMembers(anySliceToStrings(gateInputs), expectedGateEdgeIDs) {
		t.Fatalf("expected %s gate inputs to be tracked, got %#v", label, rawOutputMap(*updated, outputKeyGateInputEdgeIDs))
	}
	return gateEdgeID, updated
}

func assertThreeInputANDGateCompletion(t *testing.T, afterThird agentruns.Run, gateEdgeIDs []string) {
	t.Helper()

	gateInputs, ok := rawOutputMap(afterThird, outputKeyGateInputEdgeIDs)["gate-section"].([]any)
	if !ok || !sameStringMembers(anySliceToStrings(gateInputs), gateEdgeIDs) {
		t.Fatalf("expected all gate inputs to remain visible on completion, got %#v", rawOutputMap(afterThird, outputKeyGateInputEdgeIDs))
	}
	if got := outputStringList(afterThird, outputKeyFiredGateSectionIDs); !slices.Equal(got, []string{"gate-section"}) {
		t.Fatalf("expected fired gate-section output, got %#v", got)
	}
	if got := outputMap(afterThird, outputKeyGateStatuses)["gate-section"]; got != "satisfied" {
		t.Fatalf("expected satisfied gate status, got %#v", outputMap(afterThird, outputKeyGateStatuses))
	}
	if got := outputStringList(afterThird, outputKeyReachedEndSectionIDs); !slices.Equal(got, []string{"end-section"}) {
		t.Fatalf("expected end-section reached output, got %#v", got)
	}
	if got := eventTypes(afterThird); !slices.Equal(got[len(got)-6:], []string{
		"child_run_completed",
		"child_run_edges_activated",
		"gate_input_activated",
		"gate_satisfied",
		"end_reached",
		"run_completed",
	}) {
		t.Fatalf("expected three-input AND gate completion event tail, got %#v", got)
	}
}

func TestRuntimeHandleTerminalChildRunUpdateBlocksANDGateWhenRequiredCompletionBecomesImpossible(t *testing.T) {
	t.Parallel()

	fixture := newSignalRuntimeFixtureForProjectWithProfiles(
		t,
		gateRuntimeTestProject(t, "workflow-gate-and-blocked", projectstate.StateMachineGateTypeAND, []string{"chat-a", "chat-b"}, nil),
		nil,
		[]string{"chat-managed-1", "chat-managed-2"},
		[]string{"child-run-1", "child-run-2"},
	)

	_, err := fixture.runtime.StartRun("project-alpha", "workflow-gate-and-blocked", nil, nil)
	if err != nil {
		t.Fatalf("StartRun returned error: %v", err)
	}

	failedChildRun := setChildRunStatus(t, fixture, "child-run-1", agentruns.RunStatusFailed)
	latest, err := fixture.runtime.HandleTerminalChildRunUpdate(failedChildRun)
	if err != nil {
		t.Fatalf("HandleTerminalChildRunUpdate returned error: %v", err)
	}
	if latest == nil {
		t.Fatal("expected updated parent run after failed child")
	}
	assertBlockedANDGateRunState(t, *latest)
	assertBlockedANDGateFailureSummary(t, *latest)
	assertBlockedANDGateCancellationAndEvents(t, fixture, *latest)
}

func assertBlockedANDGateRunState(t *testing.T, latest agentruns.Run) {
	t.Helper()

	if latest.Status != agentruns.RunStatusFailed {
		t.Fatalf("expected failed parent run after gate block, got %#v", latest)
	}
	if got := outputMap(latest, outputKeyGateStatuses)["gate-section"]; got != "blocked" {
		t.Fatalf("expected blocked gate status, got %#v", outputMap(latest, outputKeyGateStatuses))
	}
	if got := outputStringList(latest, outputKeyBlockedGateSectionIDs); !slices.Equal(got, []string{"gate-section"}) {
		t.Fatalf("expected blocked gate output, got %#v", got)
	}
	blockedDetail, ok := outputMap(latest, outputKeyBlockedGateDetailsByID)["gate-section"].(map[string]any)
	if !ok {
		t.Fatalf("expected blocked gate detail, got %#v", outputMap(latest, outputKeyBlockedGateDetailsByID))
	}
	if blockedDetail["gateType"] != string(projectstate.StateMachineGateTypeAND) {
		t.Fatalf("expected AND gate detail, got %#v", blockedDetail)
	}
	if got := len(anySliceToStrings(blockedDetail["requiredEdgeIds"].([]any))); got != 2 {
		t.Fatalf("expected two required edge ids, got %#v", blockedDetail)
	}
	if got := len(anySliceToStrings(blockedDetail["impossibleEdgeIds"].([]any))); got != 2 {
		t.Fatalf("expected two impossible edge ids after cancellation, got %#v", blockedDetail)
	}
	if got := outputStringList(latest, outputKeyActiveChildRunIDs); len(got) != 0 {
		t.Fatalf("expected no active child runs after gate block, got %#v", got)
	}
	if got := outputStringList(latest, outputKeyProcessedChildTerminalIDs); !slices.Equal(got, []string{"child-run-1"}) {
		t.Fatalf("expected only the failed child to be marked processed, got %#v", got)
	}
}

func assertBlockedANDGateFailureSummary(t *testing.T, latest agentruns.Run) {
	t.Helper()

	failureSummary, ok := latest.Outputs[outputKeyFailureSummary].(map[string]any)
	if !ok {
		t.Fatalf("expected failure summary, got %#v", latest.Outputs)
	}
	if failureSummary["reason"] != "run_blocked" {
		t.Fatalf("expected run_blocked failure reason, got %#v", failureSummary)
	}
	if failureSummary["message"] != "Workflow blocked at gate gate-section." {
		t.Fatalf("expected gate-blocked failure message, got %#v", failureSummary)
	}
	if details, ok := failureSummary["details"].(map[string]any); !ok || !slices.Equal(anySliceToStrings(details["gateSectionIds"].([]any)), []string{"gate-section"}) {
		t.Fatalf("expected gateSectionIds in failure details, got %#v", failureSummary)
	} else {
		gateDetails, ok := details["gateDetailsBySectionId"].(map[string]any)
		if !ok {
			t.Fatalf("expected gateDetailsBySectionId in failure details, got %#v", failureSummary)
		}
		gateDetail, ok := gateDetails["gate-section"].(map[string]any)
		if !ok {
			t.Fatalf("expected gate-section detail in failure details, got %#v", failureSummary)
		}
		if got := len(anySliceToStrings(gateDetail["impossibleEdgeIds"].([]any))); got != 2 {
			t.Fatalf("expected failure details to capture both impossible edge ids after cancellation, got %#v", gateDetail)
		}
	}
}

func assertBlockedANDGateCancellationAndEvents(t *testing.T, fixture runtimeFixture, latest agentruns.Run) {
	t.Helper()

	if got := fixture.managedStopper.stopped; !slices.Equal(got, []string{"child-run-2"}) {
		t.Fatalf("expected running sibling child to be cancelled, got %#v", got)
	}
	if got := eventTypes(latest); !slices.Equal(got[len(got)-5:], []string{
		"child_run_failed",
		"gate_blocked",
		"child_runs_cancelled",
		"run_blocked",
		"run_failed",
	}) {
		t.Fatalf("expected blocked AND gate event tail, got %#v", got)
	}
	if gateBlockedPayload := latest.Events[len(latest.Events)-4].Payload; len(anySliceToStrings(gateBlockedPayload["impossibleEdgeIds"].([]any))) != 1 {
		t.Fatalf("expected pre-cancellation gate_blocked event to record the single impossible edge, got %#v", gateBlockedPayload)
	}
}

func TestRuntimeHandleTerminalChildRunUpdateBlocksORAndXORWhenAllMatchingOutputsAreExhausted(t *testing.T) {
	t.Parallel()

	for _, gateType := range []projectstate.StateMachineGateType{
		projectstate.StateMachineGateTypeOR,
		projectstate.StateMachineGateTypeXOR,
	} {
		t.Run(string(gateType), func(t *testing.T) {
			runBlockedORXORGateExhaustionCase(t, gateType)
		})
	}
}

func runBlockedORXORGateExhaustionCase(t *testing.T, gateType projectstate.StateMachineGateType) {
	t.Helper()

	workflowID := "workflow-gate-" + strings.ToLower(string(gateType))
	fixture := newSignalRuntimeFixtureForProjectWithProfiles(
		t,
		gateRuntimeTestProject(t, workflowID, gateType, []string{"chat-a", "chat-b"}, nil),
		nil,
		[]string{"chat-managed-1", "chat-managed-2"},
		[]string{"child-run-1", "child-run-2"},
	)
	if _, err := fixture.runtime.StartRun("project-alpha", workflowID, nil, nil); err != nil {
		t.Fatalf("StartRun returned error: %v", err)
	}

	waiting := handleTerminalChildRunUpdateForGateTest(t, fixture, "child-run-1", agentruns.RunStatusFailed)
	if waiting.Status != agentruns.RunStatusRunning {
		t.Fatalf("expected workflow to keep running while one qualifying completion remains possible, got %#v", waiting)
	}
	latest := handleTerminalChildRunUpdateForGateTest(t, fixture, "child-run-2", agentruns.RunStatusFailed)
	assertBlockedORXORGateExhaustion(t, latest, gateType)
}

func handleTerminalChildRunUpdateForGateTest(
	t *testing.T,
	fixture runtimeFixture,
	childRunID string,
	status agentruns.RunStatus,
) agentruns.Run {
	t.Helper()

	updated, err := fixture.runtime.HandleTerminalChildRunUpdate(setChildRunStatus(t, fixture, childRunID, status))
	if err != nil {
		t.Fatalf("HandleTerminalChildRunUpdate returned error: %v", err)
	}
	if updated == nil {
		t.Fatalf("expected updated parent run after %s became %s", childRunID, status)
	}
	return *updated
}

func assertBlockedORXORGateExhaustion(
	t *testing.T,
	latest agentruns.Run,
	gateType projectstate.StateMachineGateType,
) {
	t.Helper()

	if latest.Status != agentruns.RunStatusFailed {
		t.Fatalf("expected failed parent run after all matching outputs were exhausted, got %#v", latest)
	}
	assertBlockedGateOutputs(t, latest, string(gateType))
	if got := outputStringList(latest, outputKeyReachedEndSectionIDs); len(got) != 0 {
		t.Fatalf("expected no reached ends for blocked workflow, got %#v", got)
	}
	if got := outputStringList(latest, outputKeyActiveChildRunIDs); len(got) != 0 {
		t.Fatalf("expected no active child runs after gate block, got %#v", got)
	}
	assertGateBlockedFailureSummary(t, latest)
	if got := eventTypes(latest); !slices.Equal(got[len(got)-3:], []string{
		"gate_blocked",
		"run_blocked",
		"run_failed",
	}) {
		t.Fatalf("expected blocked gate event tail, got %#v", got)
	}
}

func assertBlockedGateOutputs(t *testing.T, latest agentruns.Run, expectedGateType string) {
	t.Helper()

	if got := outputMap(latest, outputKeyGateStatuses)["gate-section"]; got != "blocked" {
		t.Fatalf("expected blocked gate status, got %#v", outputMap(latest, outputKeyGateStatuses))
	}
	if got := outputStringList(latest, outputKeyBlockedGateSectionIDs); !slices.Equal(got, []string{"gate-section"}) {
		t.Fatalf("expected blocked gate output, got %#v", got)
	}
	blockedDetail, ok := outputMap(latest, outputKeyBlockedGateDetailsByID)["gate-section"].(map[string]any)
	if !ok {
		t.Fatalf("expected blocked gate detail, got %#v", outputMap(latest, outputKeyBlockedGateDetailsByID))
	}
	if blockedDetail["gateType"] != expectedGateType {
		t.Fatalf("expected %s gate detail, got %#v", expectedGateType, blockedDetail)
	}
	if got := len(anySliceToStrings(blockedDetail["requiredEdgeIds"].([]any))); got != 2 {
		t.Fatalf("expected two required edge ids, got %#v", blockedDetail)
	}
	if got := len(anySliceToStrings(blockedDetail["impossibleEdgeIds"].([]any))); got != 2 {
		t.Fatalf("expected two impossible edge ids, got %#v", blockedDetail)
	}
}

func assertGateBlockedFailureSummary(t *testing.T, latest agentruns.Run) {
	t.Helper()

	failureSummary, ok := latest.Outputs[outputKeyFailureSummary].(map[string]any)
	if !ok {
		t.Fatalf("expected failure summary, got %#v", latest.Outputs)
	}
	if failureSummary["reason"] != "run_blocked" {
		t.Fatalf("expected run_blocked failure reason, got %#v", failureSummary)
	}
	if failureSummary["message"] != "Workflow blocked at gate gate-section." {
		t.Fatalf("expected gate-blocked failure message, got %#v", failureSummary)
	}
}

func TestRuntimeHandleTerminalChildRunUpdateGateTypesORAndXORFireAfterSingleCompletion(t *testing.T) {
	t.Parallel()

	for _, gateType := range []projectstate.StateMachineGateType{
		projectstate.StateMachineGateTypeOR,
		projectstate.StateMachineGateTypeXOR,
	} {
		t.Run(string(gateType), func(t *testing.T) {
			fixture := newSignalRuntimeFixtureForProjectWithProfiles(
				t,
				gateRuntimeTestProject(t, "workflow-gate-fire-"+strings.ToLower(string(gateType)), gateType, []string{"chat-a", "chat-b"}, nil),
				nil,
				[]string{"chat-managed-1", "chat-managed-2"},
				[]string{"child-run-1", "child-run-2"},
			)

			_, err := fixture.runtime.StartRun("project-alpha", "workflow-gate-fire-"+strings.ToLower(string(gateType)), nil, nil)
			if err != nil {
				t.Fatalf("StartRun returned error: %v", err)
			}

			firstCompleted := setChildRunStatus(t, fixture, "child-run-1", agentruns.RunStatusCompleted)
			latest, err := fixture.runtime.HandleTerminalChildRunUpdate(firstCompleted)
			if err != nil {
				t.Fatalf("HandleTerminalChildRunUpdate returned error: %v", err)
			}
			if latest == nil {
				t.Fatal("expected updated parent run after first completed child")
			}
			if latest.Status != agentruns.RunStatusCompleted {
				t.Fatalf("expected completed parent run after single qualifying completion, got %#v", latest)
			}
			if got := outputStringList(*latest, outputKeyProcessedChildTerminalIDs); !slices.Equal(got, []string{"child-run-1"}) {
				t.Fatalf("expected processed child-run-1 tracking, got %#v", got)
			}
			if got := outputStringList(*latest, outputKeyFiredGateSectionIDs); !slices.Equal(got, []string{"gate-section"}) {
				t.Fatalf("expected fired gate-section output, got %#v", got)
			}
			if got := outputStringList(*latest, outputKeyReachedEndSectionIDs); !slices.Equal(got, []string{"end-section"}) {
				t.Fatalf("expected end-section reached output, got %#v", got)
			}
		})
	}
}

func TestRuntimeHandleTerminalChildRunUpdateKeepsGateToChatWorkflowRunningAfterGateFires(t *testing.T) {
	t.Parallel()

	fixture := newSignalRuntimeFixtureForProjectWithProfiles(
		t,
		gateRuntimeTestProject(t, "workflow-gate-chat", projectstate.StateMachineGateTypeAND, []string{"chat-a"}, stringPointer("chat-b")),
		nil,
		[]string{"chat-managed-1", "chat-managed-2"},
		[]string{"child-run-1", "child-run-2"},
	)

	_, err := fixture.runtime.StartRun("project-alpha", "workflow-gate-chat", nil, nil)
	if err != nil {
		t.Fatalf("StartRun returned error: %v", err)
	}

	firstCompleted := setChildRunStatus(t, fixture, "child-run-1", agentruns.RunStatusCompleted)
	latest, err := fixture.runtime.HandleTerminalChildRunUpdate(firstCompleted)
	if err != nil {
		t.Fatalf("HandleTerminalChildRunUpdate returned error: %v", err)
	}
	if latest == nil {
		t.Fatal("expected updated parent run after first completed child")
	}
	if latest.Status != agentruns.RunStatusRunning {
		t.Fatalf("expected running parent run after gate dispatches follow-up chat, got %#v", latest)
	}
	if got := outputStringList(*latest, outputKeyFiredGateSectionIDs); !slices.Equal(got, []string{"gate-section"}) {
		t.Fatalf("expected fired gate-section output, got %#v", got)
	}
	if got := outputStringList(*latest, outputKeyBlockedGateSectionIDs); len(got) != 0 {
		t.Fatalf("expected no blocked gates after gate-to-chat dispatch, got %#v", got)
	}
	if latest.Outputs[outputKeyFailureSummary] != nil {
		t.Fatalf("expected no failure summary after gate-to-chat dispatch, got %#v", latest.Outputs)
	}
	if got := outputStringList(*latest, outputKeyActiveChildRunIDs); !slices.Equal(got, []string{"child-run-2"}) {
		t.Fatalf("expected the follow-up chat run to stay active, got %#v", got)
	}
	secondChildRun, err := fixture.runs.Load("child-run-2")
	if err != nil {
		t.Fatalf("load follow-up child run: %v", err)
	}
	if runInputString(secondChildRun, inputKeyStateMachineTargetSection) != "chat-b" {
		t.Fatalf("expected follow-up child run to target chat-b, got %#v", secondChildRun.Inputs)
	}
	eventTypes := eventTypes(*latest)
	if containsString(eventTypes, "gate_blocked") || containsString(eventTypes, "run_blocked") || containsString(eventTypes, "run_failed") {
		t.Fatalf("expected gate-to-chat workflow to keep running without blocked/failure events, got %#v", eventTypes)
	}
}

func TestRuntimeHandleTerminalChildRunUpdateBranchesGateEdgesBySourceActivationCount(t *testing.T) {
	t.Parallel()

	fixture := newSignalRuntimeFixtureForProjectWithProfiles(
		t,
		gateSourceCountLoopRuntimeTestProject(t),
		nil,
		[]string{
			"chat-managed-1", "chat-managed-2", "chat-managed-3",
			"chat-managed-4", "chat-managed-5", "chat-managed-6",
			"chat-managed-7", "chat-managed-8", "chat-managed-9",
		},
		[]string{
			"child-run-1", "child-run-2", "child-run-3",
			"child-run-4", "child-run-5", "child-run-6",
			"child-run-7", "child-run-8", "child-run-9",
		},
	)

	started, err := fixture.runtime.StartRun("project-alpha", "workflow-source-count", nil, nil)
	if err != nil {
		t.Fatalf("StartRun returned error: %v", err)
	}
	if got := outputIntMap(started, outputKeySourceActivationCounts); got["start-section"] != 1 {
		t.Fatalf("expected start-section activation count 1 after launch, got %#v", got)
	}
	if len(fixture.managedStarter.requests) != 3 {
		t.Fatalf("expected three initial managed chat requests, got %#v", fixture.managedStarter.requests)
	}
	assertChildRunSourceCounts(t, fixture, []string{"child-run-1", "child-run-2", "child-run-3"}, 0, "initial")

	afterFirstLoop := completeTerminalChildRuns(t, fixture, []string{"child-run-1", "child-run-2", "child-run-3"})
	assertGateSourceCountLoopRun(t, afterFirstLoop, 1, agentruns.RunStatusRunning, "first")
	if len(fixture.managedStarter.requests) != 6 {
		t.Fatalf("expected six managed chat requests after first loop, got %#v", fixture.managedStarter.requests)
	}
	assertChildRunSourceCounts(t, fixture, []string{"child-run-4", "child-run-5", "child-run-6"}, 0, "second-loop")

	afterSecondLoop := completeTerminalChildRuns(t, fixture, []string{"child-run-4", "child-run-5", "child-run-6"})
	assertGateSourceCountLoopRun(t, afterSecondLoop, 2, agentruns.RunStatusRunning, "second")
	if len(fixture.managedStarter.requests) != 9 {
		t.Fatalf("expected nine managed chat requests after second loop, got %#v", fixture.managedStarter.requests)
	}
	assertChildRunSourceCounts(t, fixture, []string{"child-run-7", "child-run-8", "child-run-9"}, 1, "third-loop")

	completed := completeTerminalChildRuns(t, fixture, []string{"child-run-7", "child-run-8", "child-run-9"})
	assertGateSourceCountLoopRun(t, completed, 3, agentruns.RunStatusCompleted, "final")
	if got := outputStringList(*completed, outputKeyReachedEndSectionIDs); !slices.Equal(got, []string{"end-section"}) {
		t.Fatalf("expected end-section reached output, got %#v", got)
	}
	if got := eventTypes(*completed); !slices.Equal(got[len(got)-2:], []string{"end_reached", "run_completed"}) {
		t.Fatalf("expected final completion event tail, got %#v", got)
	}
}

func assertChildRunSourceCounts(t *testing.T, fixture runtimeFixture, childRunIDs []string, want int, label string) {
	t.Helper()

	for _, childRunID := range childRunIDs {
		childRun, err := fixture.runs.Load(childRunID)
		if err != nil {
			t.Fatalf("load %s child run %q: %v", label, childRunID, err)
		}
		if got := numericInputValue(t, childRun, inputKeyStateMachineSourceCount); got != want {
			t.Fatalf("expected %s child run source activation count %v, got %#v", label, want, childRun.Inputs)
		}
	}
}

func completeTerminalChildRuns(t *testing.T, fixture runtimeFixture, childRunIDs []string) *agentruns.Run {
	t.Helper()

	var latest *agentruns.Run
	for _, childRunID := range childRunIDs {
		var err error
		latest, err = fixture.runtime.HandleTerminalChildRunUpdate(setChildRunStatus(t, fixture, childRunID, agentruns.RunStatusCompleted))
		if err != nil {
			t.Fatalf("HandleTerminalChildRunUpdate returned error: %v", err)
		}
	}
	if latest == nil {
		t.Fatalf("expected updated parent run after completing %#v", childRunIDs)
	}
	return latest
}

func assertGateSourceCountLoopRun(t *testing.T, run *agentruns.Run, wantCount int, wantStatus agentruns.RunStatus, label string) {
	t.Helper()

	if run.Status != wantStatus {
		t.Fatalf("expected %s parent run status %q, got %#v", label, wantStatus, run)
	}
	counts := outputIntMap(*run, outputKeySourceActivationCounts)
	if counts["chat-a"] != wantCount || counts["chat-b"] != wantCount || counts["chat-c"] != wantCount || counts["gate-section"] != wantCount {
		t.Fatalf("expected %s source activation counts %d, got %#v", label, wantCount, counts)
	}
}

func TestRuntimeHandleTerminalChildRunUpdateUsesStartTimeGraphSnapshotAfterDraftEdit(t *testing.T) {
	t.Parallel()

	project := stateMachineRuntimeTestProject(t)
	project.StateMachineEdges = []projectstate.StateMachineEdge{
		{
			ID:              "edge-start-chat",
			MachineGroupID:  "workflow-a",
			SourceSectionID: "start-section",
			SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
			TargetSectionID: "chat-section",
			TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
			TargetAction: &projectstate.StateMachineTargetAction{
				Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
				InlinePrompt:   stringPointer("Review the draft."),
				ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
			},
		},
		{
			ID:              "edge-chat-end",
			MachineGroupID:  "workflow-a",
			SourceSectionID: "chat-section",
			SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
			TargetSectionID: "end-section",
			TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
			SourceFilter: &projectstate.StateMachineSourceFilter{
				Type: projectstate.StateMachineSourceFilterTypeRunCompleted,
			},
		},
	}
	fixture := newSignalRuntimeFixtureForProjectWithProfiles(
		t,
		project,
		nil,
		[]string{"chat-managed-1"},
		[]string{"child-run-1"},
	)

	started, err := fixture.runtime.StartRun("project-alpha", "workflow-a", nil, nil)
	if err != nil {
		t.Fatalf("StartRun returned error: %v", err)
	}

	if _, err := fixture.projectRuntime.SetStateMachineEdges(context.Background(), "project-alpha", []projectstate.StateMachineEdge{
		{
			ID:              "edge-start-chat",
			MachineGroupID:  "workflow-a",
			SourceSectionID: "start-section",
			SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
			TargetSectionID: "chat-section",
			TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
			TargetAction: &projectstate.StateMachineTargetAction{
				Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
				InlinePrompt:   stringPointer("Review the draft."),
				ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
			},
		},
		{
			ID:              "edge-chat-end",
			MachineGroupID:  "workflow-a",
			SourceSectionID: "chat-section",
			SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
			TargetSectionID: "end-section",
			TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
			SourceFilter: &projectstate.StateMachineSourceFilter{
				Type: projectstate.StateMachineSourceFilterTypeRunFailed,
			},
		},
	}, nil); err != nil {
		t.Fatalf("edit workflow edges after start: %v", err)
	}

	completed, err := fixture.runtime.HandleTerminalChildRunUpdate(setChildRunStatus(t, fixture, "child-run-1", agentruns.RunStatusCompleted))
	if err != nil {
		t.Fatalf("HandleTerminalChildRunUpdate returned error: %v", err)
	}
	if completed == nil {
		t.Fatal("expected updated parent run after child completion")
	}
	if completed.ID != started.ID {
		t.Fatalf("expected the started parent run to be updated, got %#v", completed)
	}
	if completed.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed parent run after draft edit, got %#v", completed)
	}
	if got := outputStringList(*completed, outputKeyReachedEndSectionIDs); !slices.Equal(got, []string{"end-section"}) {
		t.Fatalf("expected end-section reached output from the launch-time graph snapshot, got %#v", got)
	}
}

func TestRuntimeHandleTerminalChildRunUpdateRoutesCompletedChildRunToFollowUpChat(t *testing.T) {
	t.Parallel()

	fixture := newFollowUpChatRuntimeFixture(t)
	parentRun, err := fixture.runtime.StartRun("project-alpha", "workflow-follow-up", nil, nil)
	if err != nil {
		t.Fatalf("StartRun returned error: %v", err)
	}

	childRun, err := fixture.runs.Load("child-run-1")
	if err != nil {
		t.Fatalf("load initial child run: %v", err)
	}
	childRun.Status = agentruns.RunStatusCompleted
	if err := fixture.runs.Save(childRun); err != nil {
		t.Fatalf("save completed child run: %v", err)
	}

	updated, err := fixture.runtime.HandleTerminalChildRunUpdate(childRun)
	if err != nil {
		t.Fatalf("HandleTerminalChildRunUpdate returned error: %v", err)
	}
	if updated == nil {
		t.Fatal("expected updated parent run")
	}
	assertFollowUpParentRunState(t, *updated, parentRun.ID)
	assertFollowUpChildRunDispatch(t, fixture, *updated)
}

func assertFollowUpParentRunState(t *testing.T, updated agentruns.Run, parentRunID string) {
	t.Helper()

	if updated.Status != agentruns.RunStatusRunning {
		t.Fatalf("expected running parent run after follow-up dispatch, got %#v", updated)
	}
	if updated.ID != parentRunID {
		t.Fatalf("expected same parent run id %q, got %q", parentRunID, updated.ID)
	}
	if got := outputStringList(updated, outputKeyProcessedChildTerminalIDs); len(got) != 1 || got[0] != "child-run-1" {
		t.Fatalf("expected processed child-run-1 tracking, got %#v", got)
	}
	if got := outputStringList(updated, outputKeyChildRunIDs); !sameStringMembers(got, []string{"child-run-1", "child-run-2"}) {
		t.Fatalf("expected both child runs to be tracked, got %#v", got)
	}
	if got := outputStringList(updated, outputKeyActiveChildRunIDs); len(got) != 1 || got[0] != "child-run-2" {
		t.Fatalf("expected follow-up child run to stay active, got %#v", got)
	}
}

func assertFollowUpChildRunDispatch(t *testing.T, fixture runtimeFixture, updated agentruns.Run) {
	t.Helper()

	if len(fixture.managedStarter.requests) != 2 {
		t.Fatalf("expected second managed chat dispatch for follow-up chat, got %#v", fixture.managedStarter.requests)
	}
	secondChildRun, err := fixture.runs.Load("child-run-2")
	if err != nil {
		t.Fatalf("load follow-up child run: %v", err)
	}
	if runInputString(secondChildRun, inputKeyStateMachineTargetSection) != "chat-b" {
		t.Fatalf("expected follow-up child run to target chat-b, got %#v", secondChildRun.Inputs)
	}
	if got := outputListOfMaps(updated, outputKeyDispatchedEdgeActions); len(got) != 1 {
		t.Fatalf("expected one follow-up dispatched edge action, got %#v", got)
	} else {
		if got[0]["edgeId"] != "edge-chat-a-chat-b" {
			t.Fatalf("expected follow-up edge id edge-chat-a-chat-b, got %#v", got[0])
		}
		if got[0]["targetSectionId"] != "chat-b" {
			t.Fatalf("expected follow-up target chat-b, got %#v", got[0])
		}
		if got[0]["runId"] != "child-run-2" {
			t.Fatalf("expected follow-up child run id child-run-2, got %#v", got[0])
		}
	}
	if got := eventTypes(updated); !slices.Equal(got[len(got)-3:], []string{
		"child_run_completed",
		"child_run_edges_activated",
		"edge_action_dispatched",
	}) {
		t.Fatalf("expected follow-up child completion event tail, got %#v", got)
	}
}

func TestRuntimeHandleTerminalChildRunUpdateRoutesFailedChildRunToEnd(t *testing.T) {
	t.Parallel()

	fixture := newSignalRuntimeFixtureForProjectWithProfiles(
		t,
		failedChildToEndRuntimeTestProject(t),
		nil,
		[]string{"chat-managed-1"},
		[]string{"child-run-1"},
	)
	parentRun, err := fixture.runtime.StartRun("project-alpha", "workflow-failed-end", nil, nil)
	if err != nil {
		t.Fatalf("StartRun returned error: %v", err)
	}

	childRun, err := fixture.runs.Load("child-run-1")
	if err != nil {
		t.Fatalf("load initial child run: %v", err)
	}
	childRun.Status = agentruns.RunStatusFailed
	if err := fixture.runs.Save(childRun); err != nil {
		t.Fatalf("save failed child run: %v", err)
	}

	updated, err := fixture.runtime.HandleTerminalChildRunUpdate(childRun)
	if err != nil {
		t.Fatalf("HandleTerminalChildRunUpdate returned error: %v", err)
	}
	if updated == nil {
		t.Fatal("expected updated parent run")
	}
	if updated.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed parent run after failed-child end route, got %#v", updated)
	}
	if updated.ID != parentRun.ID {
		t.Fatalf("expected same parent run id %q, got %q", parentRun.ID, updated.ID)
	}
	if got := outputStringList(*updated, outputKeyProcessedChildTerminalIDs); len(got) != 1 || got[0] != "child-run-1" {
		t.Fatalf("expected processed child-run-1 tracking, got %#v", got)
	}
	if got := outputStringList(*updated, outputKeyReachedEndSectionIDs); len(got) != 1 || got[0] != "end-section" {
		t.Fatalf("expected reached end tracking, got %#v", got)
	}
	if got := outputStringList(*updated, outputKeyActiveChildRunIDs); len(got) != 0 {
		t.Fatalf("expected no active child runs after routing failed child to end, got %#v", got)
	}
	if got := eventTypes(*updated); !slices.Equal(got[len(got)-4:], []string{
		"child_run_failed",
		"child_run_edges_activated",
		"end_reached",
		"run_completed",
	}) {
		t.Fatalf("expected failed-child end route event tail, got %#v", got)
	}
}

func TestRuntimeHandleTerminalChildRunUpdateFailsStalledWhenFailedChildHasNoMatchingTransition(t *testing.T) {
	t.Parallel()

	fixture := newSignalRuntimeFixtureForProjectWithProfiles(
		t,
		stalledRuntimeTestProject(t, "workflow-stalled-failed"),
		nil,
		[]string{"chat-managed-1"},
		[]string{"child-run-1"},
	)
	parentRun, err := fixture.runtime.StartRun("project-alpha", "workflow-stalled-failed", nil, nil)
	if err != nil {
		t.Fatalf("StartRun returned error: %v", err)
	}

	childRun, err := fixture.runs.Load("child-run-1")
	if err != nil {
		t.Fatalf("load child run: %v", err)
	}
	childRun.Status = agentruns.RunStatusFailed
	if err := fixture.runs.Save(childRun); err != nil {
		t.Fatalf("save failed child run: %v", err)
	}

	updated, err := fixture.runtime.HandleTerminalChildRunUpdate(childRun)
	if err != nil {
		t.Fatalf("HandleTerminalChildRunUpdate returned error: %v", err)
	}
	if updated == nil {
		t.Fatal("expected updated parent run")
	}
	if updated.Status != agentruns.RunStatusFailed {
		t.Fatalf("expected failed parent run, got %#v", updated)
	}
	if updated.ID != parentRun.ID {
		t.Fatalf("expected same parent run id %q, got %q", parentRun.ID, updated.ID)
	}
	if got := outputStringList(*updated, outputKeyActiveChildRunIDs); len(got) != 0 {
		t.Fatalf("expected no active child runs after stalled failure, got %#v", got)
	}
	if failureSummary, ok := updated.Outputs[outputKeyFailureSummary].(map[string]any); !ok {
		t.Fatalf("expected failure summary, got %#v", updated.Outputs)
	} else {
		if failureSummary["reason"] != "run_stalled" {
			t.Fatalf("expected run_stalled reason, got %#v", failureSummary)
		}
		if failureSummary["message"] != "Workflow has no active children, pending signals, or reachable next step." {
			t.Fatalf("expected stalled failure message, got %#v", failureSummary)
		}
		if details, ok := failureSummary["details"].(map[string]any); !ok || len(details) != 0 {
			t.Fatalf("expected empty stalled failure details, got %#v", failureSummary)
		}
	}
	if got := eventTypes(*updated); !slices.Equal(got[len(got)-2:], []string{
		"child_run_failed",
		"run_failed",
	}) {
		t.Fatalf("expected stalled failure event tail, got %#v", got)
	}
}

func TestRuntimeHandleTerminalChildRunUpdateFailsStalledWhenCancelledChildHasNoMatchingTransition(t *testing.T) {
	t.Parallel()

	fixture := newSignalRuntimeFixtureForProjectWithProfiles(
		t,
		stalledRuntimeTestProject(t, "workflow-stalled-cancelled"),
		nil,
		[]string{"chat-managed-1"},
		[]string{"child-run-1"},
	)
	parentRun, err := fixture.runtime.StartRun("project-alpha", "workflow-stalled-cancelled", nil, nil)
	if err != nil {
		t.Fatalf("StartRun returned error: %v", err)
	}

	childRun, err := fixture.runs.Load("child-run-1")
	if err != nil {
		t.Fatalf("load child run: %v", err)
	}
	childRun.Status = agentruns.RunStatusCancelled
	if err := fixture.runs.Save(childRun); err != nil {
		t.Fatalf("save cancelled child run: %v", err)
	}

	updated, err := fixture.runtime.HandleTerminalChildRunUpdate(childRun)
	if err != nil {
		t.Fatalf("HandleTerminalChildRunUpdate returned error: %v", err)
	}
	if updated == nil {
		t.Fatal("expected updated parent run")
	}
	if updated.Status != agentruns.RunStatusFailed {
		t.Fatalf("expected failed parent run, got %#v", updated)
	}
	if updated.ID != parentRun.ID {
		t.Fatalf("expected same parent run id %q, got %q", parentRun.ID, updated.ID)
	}
	if got := outputStringList(*updated, outputKeyActiveChildRunIDs); len(got) != 0 {
		t.Fatalf("expected no active child runs after cancelled stall, got %#v", got)
	}
	if failureSummary, ok := updated.Outputs[outputKeyFailureSummary].(map[string]any); !ok {
		t.Fatalf("expected failure summary, got %#v", updated.Outputs)
	} else {
		if failureSummary["reason"] != "run_stalled" {
			t.Fatalf("expected run_stalled reason, got %#v", failureSummary)
		}
		if failureSummary["message"] != "Workflow has no active children, pending signals, or reachable next step." {
			t.Fatalf("expected stalled failure message, got %#v", failureSummary)
		}
		if details, ok := failureSummary["details"].(map[string]any); !ok || len(details) != 0 {
			t.Fatalf("expected empty stalled failure details, got %#v", failureSummary)
		}
	}
	if got := eventTypes(*updated); !slices.Equal(got[len(got)-2:], []string{
		"child_run_cancelled",
		"run_failed",
	}) {
		t.Fatalf("expected cancelled stalled event tail, got %#v", got)
	}
}
