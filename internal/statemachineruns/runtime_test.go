package statemachineruns

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/managedchat"
	"setta/internal/projectstate"
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
	if len(fixture.managedStarter.requests) != 1 {
		t.Fatalf("expected one managed chat request, got %d", len(fixture.managedStarter.requests))
	}
	childRun, err := fixture.runs.Load("child-run-1")
	if err != nil {
		t.Fatalf("load child run: %v", err)
	}
	if runInputString(childRun, inputKeyStateMachineRunID) != run.ID {
		t.Fatalf("expected child run parent id %q, got %#v", run.ID, childRun.Inputs)
	}
	if runInputString(childRun, inputKeyStateMachineTargetSection) != "chat-section" {
		t.Fatalf("expected child run target section metadata, got %#v", childRun.Inputs)
	}
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
		projectstate.PromptFormatJinja,
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

	afterFirst, err := fixture.runtime.HandleTerminalChildRunUpdate(setChildRunStatus(t, fixture, "child-run-1", agentruns.RunStatusCompleted))
	if err != nil {
		t.Fatalf("HandleTerminalChildRunUpdate returned error: %v", err)
	}
	if afterFirst == nil {
		t.Fatal("expected updated parent run after first completion")
	}
	firstChildRun, err := fixture.runs.Load("child-run-1")
	if err != nil {
		t.Fatalf("load first child run: %v", err)
	}
	firstGateEdgeID := fmt.Sprintf("edge-%s-gate", runInputString(firstChildRun, inputKeyStateMachineTargetSection))
	gateInputs, ok := rawOutputMap(*afterFirst, outputKeyGateInputEdgeIDs)["gate-section"].([]any)
	if !ok || !sameStringMembers(anySliceToStrings(gateInputs), []string{firstGateEdgeID}) {
		t.Fatalf("expected first gate input to track %s, got %#v", firstGateEdgeID, rawOutputMap(*afterFirst, outputKeyGateInputEdgeIDs))
	}

	afterSecond, err := fixture.runtime.HandleTerminalChildRunUpdate(setChildRunStatus(t, fixture, "child-run-2", agentruns.RunStatusCompleted))
	if err != nil {
		t.Fatalf("HandleTerminalChildRunUpdate returned error: %v", err)
	}
	if afterSecond == nil {
		t.Fatal("expected updated parent run after second completion")
	}
	secondChildRun, err := fixture.runs.Load("child-run-2")
	if err != nil {
		t.Fatalf("load second child run: %v", err)
	}
	secondGateEdgeID := fmt.Sprintf("edge-%s-gate", runInputString(secondChildRun, inputKeyStateMachineTargetSection))
	gateInputs, ok = rawOutputMap(*afterSecond, outputKeyGateInputEdgeIDs)["gate-section"].([]any)
	if !ok || !sameStringMembers(anySliceToStrings(gateInputs), []string{firstGateEdgeID, secondGateEdgeID}) {
		t.Fatalf("expected first two gate inputs to be tracked, got %#v", rawOutputMap(*afterSecond, outputKeyGateInputEdgeIDs))
	}

	afterThird, err := fixture.runtime.HandleTerminalChildRunUpdate(setChildRunStatus(t, fixture, "child-run-3", agentruns.RunStatusCompleted))
	if err != nil {
		t.Fatalf("HandleTerminalChildRunUpdate returned error: %v", err)
	}
	if afterThird == nil {
		t.Fatal("expected updated parent run after third completion")
	}
	thirdChildRun, err := fixture.runs.Load("child-run-3")
	if err != nil {
		t.Fatalf("load third child run: %v", err)
	}
	thirdGateEdgeID := fmt.Sprintf("edge-%s-gate", runInputString(thirdChildRun, inputKeyStateMachineTargetSection))
	gateInputs, ok = rawOutputMap(*afterThird, outputKeyGateInputEdgeIDs)["gate-section"].([]any)
	if !ok || !sameStringMembers(anySliceToStrings(gateInputs), []string{firstGateEdgeID, secondGateEdgeID, thirdGateEdgeID}) {
		t.Fatalf("expected all gate inputs to remain visible on completion, got %#v", rawOutputMap(*afterThird, outputKeyGateInputEdgeIDs))
	}
	if got := outputStringList(*afterThird, outputKeyFiredGateSectionIDs); !slices.Equal(got, []string{"gate-section"}) {
		t.Fatalf("expected fired gate-section output, got %#v", got)
	}
	if got := outputMap(*afterThird, outputKeyGateStatuses)["gate-section"]; got != "satisfied" {
		t.Fatalf("expected satisfied gate status, got %#v", outputMap(*afterThird, outputKeyGateStatuses))
	}
	if got := outputStringList(*afterThird, outputKeyReachedEndSectionIDs); !slices.Equal(got, []string{"end-section"}) {
		t.Fatalf("expected end-section reached output, got %#v", got)
	}
	if got := eventTypes(*afterThird); !slices.Equal(got[len(got)-6:], []string{
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
	if latest.Status != agentruns.RunStatusFailed {
		t.Fatalf("expected failed parent run after gate block, got %#v", latest)
	}
	if got := outputMap(*latest, outputKeyGateStatuses)["gate-section"]; got != "blocked" {
		t.Fatalf("expected blocked gate status, got %#v", outputMap(*latest, outputKeyGateStatuses))
	}
	if got := outputStringList(*latest, outputKeyBlockedGateSectionIDs); !slices.Equal(got, []string{"gate-section"}) {
		t.Fatalf("expected blocked gate output, got %#v", got)
	}
	blockedDetail, ok := outputMap(*latest, outputKeyBlockedGateDetailsByID)["gate-section"].(map[string]any)
	if !ok {
		t.Fatalf("expected blocked gate detail, got %#v", outputMap(*latest, outputKeyBlockedGateDetailsByID))
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
	if got := outputStringList(*latest, outputKeyActiveChildRunIDs); len(got) != 0 {
		t.Fatalf("expected no active child runs after gate block, got %#v", got)
	}
	if got := outputStringList(*latest, outputKeyProcessedChildTerminalIDs); !slices.Equal(got, []string{"child-run-1"}) {
		t.Fatalf("expected only the failed child to be marked processed, got %#v", got)
	}
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
	if got := fixture.managedStopper.stopped; !slices.Equal(got, []string{"child-run-2"}) {
		t.Fatalf("expected running sibling child to be cancelled, got %#v", got)
	}
	if got := eventTypes(*latest); !slices.Equal(got[len(got)-5:], []string{
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
			fixture := newSignalRuntimeFixtureForProjectWithProfiles(
				t,
				gateRuntimeTestProject(t, "workflow-gate-"+strings.ToLower(string(gateType)), gateType, []string{"chat-a", "chat-b"}, nil),
				nil,
				[]string{"chat-managed-1", "chat-managed-2"},
				[]string{"child-run-1", "child-run-2"},
			)

			_, err := fixture.runtime.StartRun("project-alpha", "workflow-gate-"+strings.ToLower(string(gateType)), nil, nil)
			if err != nil {
				t.Fatalf("StartRun returned error: %v", err)
			}

			firstFailed := setChildRunStatus(t, fixture, "child-run-1", agentruns.RunStatusFailed)
			waiting, err := fixture.runtime.HandleTerminalChildRunUpdate(firstFailed)
			if err != nil {
				t.Fatalf("HandleTerminalChildRunUpdate returned error: %v", err)
			}
			if waiting == nil {
				t.Fatal("expected updated parent run after first failed child")
			}
			if waiting.Status != agentruns.RunStatusRunning {
				t.Fatalf("expected workflow to keep running while one qualifying completion remains possible, got %#v", waiting)
			}

			secondFailed := setChildRunStatus(t, fixture, "child-run-2", agentruns.RunStatusFailed)
			latest, err := fixture.runtime.HandleTerminalChildRunUpdate(secondFailed)
			if err != nil {
				t.Fatalf("HandleTerminalChildRunUpdate returned error: %v", err)
			}
			if latest == nil {
				t.Fatal("expected updated parent run after second failed child")
			}
			if latest.Status != agentruns.RunStatusFailed {
				t.Fatalf("expected failed parent run after all matching outputs were exhausted, got %#v", latest)
			}
			if got := outputMap(*latest, outputKeyGateStatuses)["gate-section"]; got != "blocked" {
				t.Fatalf("expected blocked gate status, got %#v", outputMap(*latest, outputKeyGateStatuses))
			}
			if got := outputStringList(*latest, outputKeyBlockedGateSectionIDs); !slices.Equal(got, []string{"gate-section"}) {
				t.Fatalf("expected blocked gate output, got %#v", got)
			}
			blockedDetail, ok := outputMap(*latest, outputKeyBlockedGateDetailsByID)["gate-section"].(map[string]any)
			if !ok {
				t.Fatalf("expected blocked gate detail, got %#v", outputMap(*latest, outputKeyBlockedGateDetailsByID))
			}
			if blockedDetail["gateType"] != string(gateType) {
				t.Fatalf("expected %s gate detail, got %#v", gateType, blockedDetail)
			}
			if got := len(anySliceToStrings(blockedDetail["requiredEdgeIds"].([]any))); got != 2 {
				t.Fatalf("expected two required edge ids, got %#v", blockedDetail)
			}
			if got := len(anySliceToStrings(blockedDetail["impossibleEdgeIds"].([]any))); got != 2 {
				t.Fatalf("expected two impossible edge ids, got %#v", blockedDetail)
			}
			if got := outputStringList(*latest, outputKeyReachedEndSectionIDs); len(got) != 0 {
				t.Fatalf("expected no reached ends for blocked workflow, got %#v", got)
			}
			if got := outputStringList(*latest, outputKeyActiveChildRunIDs); len(got) != 0 {
				t.Fatalf("expected no active child runs after gate block, got %#v", got)
			}
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
			if got := eventTypes(*latest); !slices.Equal(got[len(got)-3:], []string{
				"gate_blocked",
				"run_blocked",
				"run_failed",
			}) {
				t.Fatalf("expected blocked gate event tail, got %#v", got)
			}
		})
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
	for _, childRunID := range []string{"child-run-1", "child-run-2", "child-run-3"} {
		childRun, err := fixture.runs.Load(childRunID)
		if err != nil {
			t.Fatalf("load initial child run %q: %v", childRunID, err)
		}
		if got := numericInputValue(t, childRun, inputKeyStateMachineSourceCount); got != 0 {
			t.Fatalf("expected initial child run source activation count 0, got %#v", childRun.Inputs)
		}
	}

	var afterFirstLoop *agentruns.Run
	for _, childRunID := range []string{"child-run-1", "child-run-2", "child-run-3"} {
		afterFirstLoop, err = fixture.runtime.HandleTerminalChildRunUpdate(setChildRunStatus(t, fixture, childRunID, agentruns.RunStatusCompleted))
		if err != nil {
			t.Fatalf("HandleTerminalChildRunUpdate returned error: %v", err)
		}
	}
	if afterFirstLoop == nil {
		t.Fatal("expected updated parent run after first loop")
	}
	if afterFirstLoop.Status != agentruns.RunStatusRunning {
		t.Fatalf("expected running parent run after first gate loop, got %#v", afterFirstLoop)
	}
	if got := outputIntMap(*afterFirstLoop, outputKeySourceActivationCounts); got["chat-a"] != 1 || got["chat-b"] != 1 || got["chat-c"] != 1 || got["gate-section"] != 1 {
		t.Fatalf("expected first-loop source activation counts, got %#v", got)
	}
	if len(fixture.managedStarter.requests) != 6 {
		t.Fatalf("expected six managed chat requests after first loop, got %#v", fixture.managedStarter.requests)
	}
	for _, childRunID := range []string{"child-run-4", "child-run-5", "child-run-6"} {
		childRun, err := fixture.runs.Load(childRunID)
		if err != nil {
			t.Fatalf("load second-loop child run %q: %v", childRunID, err)
		}
		if got := numericInputValue(t, childRun, inputKeyStateMachineSourceCount); got != 0 {
			t.Fatalf("expected first branched loop to see gate source activation count 0, got %#v", childRun.Inputs)
		}
	}

	var afterSecondLoop *agentruns.Run
	for _, childRunID := range []string{"child-run-4", "child-run-5", "child-run-6"} {
		afterSecondLoop, err = fixture.runtime.HandleTerminalChildRunUpdate(setChildRunStatus(t, fixture, childRunID, agentruns.RunStatusCompleted))
		if err != nil {
			t.Fatalf("HandleTerminalChildRunUpdate returned error: %v", err)
		}
	}
	if afterSecondLoop == nil {
		t.Fatal("expected updated parent run after second loop")
	}
	if afterSecondLoop.Status != agentruns.RunStatusRunning {
		t.Fatalf("expected running parent run after second gate loop, got %#v", afterSecondLoop)
	}
	if got := outputIntMap(*afterSecondLoop, outputKeySourceActivationCounts); got["chat-a"] != 2 || got["chat-b"] != 2 || got["chat-c"] != 2 || got["gate-section"] != 2 {
		t.Fatalf("expected second-loop source activation counts, got %#v", got)
	}
	if len(fixture.managedStarter.requests) != 9 {
		t.Fatalf("expected nine managed chat requests after second loop, got %#v", fixture.managedStarter.requests)
	}
	for _, childRunID := range []string{"child-run-7", "child-run-8", "child-run-9"} {
		childRun, err := fixture.runs.Load(childRunID)
		if err != nil {
			t.Fatalf("load third-loop child run %q: %v", childRunID, err)
		}
		if got := numericInputValue(t, childRun, inputKeyStateMachineSourceCount); got != 1 {
			t.Fatalf("expected second branched loop to see gate source activation count 1, got %#v", childRun.Inputs)
		}
	}

	var completed *agentruns.Run
	for _, childRunID := range []string{"child-run-7", "child-run-8", "child-run-9"} {
		completed, err = fixture.runtime.HandleTerminalChildRunUpdate(setChildRunStatus(t, fixture, childRunID, agentruns.RunStatusCompleted))
		if err != nil {
			t.Fatalf("HandleTerminalChildRunUpdate returned error: %v", err)
		}
	}
	if completed == nil {
		t.Fatal("expected completed parent run after third loop")
	}
	if completed.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed parent run after final gate branch, got %#v", completed)
	}
	if got := outputIntMap(*completed, outputKeySourceActivationCounts); got["chat-a"] != 3 || got["chat-b"] != 3 || got["chat-c"] != 3 || got["gate-section"] != 3 {
		t.Fatalf("expected final source activation counts, got %#v", got)
	}
	if got := outputStringList(*completed, outputKeyReachedEndSectionIDs); !slices.Equal(got, []string{"end-section"}) {
		t.Fatalf("expected end-section reached output, got %#v", got)
	}
	if got := eventTypes(*completed); !slices.Equal(got[len(got)-2:], []string{"end_reached", "run_completed"}) {
		t.Fatalf("expected final completion event tail, got %#v", got)
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
	if updated.Status != agentruns.RunStatusRunning {
		t.Fatalf("expected running parent run after follow-up dispatch, got %#v", updated)
	}
	if updated.ID != parentRun.ID {
		t.Fatalf("expected same parent run id %q, got %q", parentRun.ID, updated.ID)
	}
	if got := outputStringList(*updated, outputKeyProcessedChildTerminalIDs); len(got) != 1 || got[0] != "child-run-1" {
		t.Fatalf("expected processed child-run-1 tracking, got %#v", got)
	}
	if got := outputStringList(*updated, outputKeyChildRunIDs); !sameStringMembers(got, []string{"child-run-1", "child-run-2"}) {
		t.Fatalf("expected both child runs to be tracked, got %#v", got)
	}
	if got := outputStringList(*updated, outputKeyActiveChildRunIDs); len(got) != 1 || got[0] != "child-run-2" {
		t.Fatalf("expected follow-up child run to stay active, got %#v", got)
	}
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
	if got := outputListOfMaps(*updated, outputKeyDispatchedEdgeActions); len(got) != 1 {
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
	if got := eventTypes(*updated); !slices.Equal(got[len(got)-3:], []string{
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

func TestRuntimeStartRunFailsClosedWhenSignalTargetProfileDisallowsWorkflowSignalTool(t *testing.T) {
	t.Parallel()

	fixture := newSignalRuntimeFixtureWithProfiles(t, []agentprofiles.Profile{{
		ID:            "profile-no-signal",
		Name:          "No Signal Tool",
		ToolAllowlist: []string{"setta__search_ui_settings"},
	}})

	run, err := fixture.runtime.StartRun("project-alpha", "workflow-signal", nil, nil)
	if err == nil {
		t.Fatal("expected StartRun to fail when the selected profile cannot call report_state_machine_signal")
	}
	if len(fixture.managedStarter.requests) != 0 {
		t.Fatalf("expected no managed chat dispatch before fail-closed validation, got %#v", fixture.managedStarter.requests)
	}
	if run.Status != agentruns.RunStatusFailed {
		t.Fatalf("expected failed parent run, got %#v", run)
	}
	failureSummary, ok := run.Outputs[outputKeyFailureSummary].(map[string]any)
	if !ok {
		t.Fatalf("expected failure summary to persist, got %#v", run.Outputs)
	}
	if failureSummary["reason"] != "start_edge_action_failed" {
		t.Fatalf("expected start_edge_action_failed code, got %#v", failureSummary)
	}
	if message, ok := failureSummary["message"].(string); !ok || message == "" || !containsAll(message, "profile-no-signal", workflowSignalToolBaseName) {
		t.Fatalf("expected failure detail to mention blocked signal tool, got %#v", failureSummary)
	}
	latest, loadErr := fixture.runtime.GetLatestRun("project-alpha", "workflow-signal", nil)
	if loadErr != nil {
		t.Fatalf("GetLatestRun returned error: %v", loadErr)
	}
	if latest == nil || latest.Status != agentruns.RunStatusFailed {
		t.Fatalf("expected failed latest workflow run, got %#v", latest)
	}
}

func TestRuntimeStartRunRejectsMachineGroupWithoutStartSection(t *testing.T) {
	t.Parallel()

	fixture := newRuntimeFixture(t)

	_, err := fixture.runtime.StartRun("project-alpha", "workflow-missing", nil, nil)
	if !errors.Is(err, ErrInvalidStateMachineInput) {
		t.Fatalf("expected typed invalid workflow input, got %v", err)
	}
	if !strings.Contains(err.Error(), "does not have a Start section") {
		t.Fatalf("expected missing-start detail, got %v", err)
	}
}

func TestRuntimeStopRunCancelsRunningChildRuns(t *testing.T) {
	t.Parallel()

	fixture := newRuntimeFixture(t)
	parentRun, err := fixture.runtime.StartRun("project-alpha", "workflow-a", nil, nil)
	if err != nil {
		t.Fatalf("StartRun returned error: %v", err)
	}

	stopped, err := fixture.runtime.StopRun("project-alpha", "workflow-a", nil)
	if err != nil {
		t.Fatalf("StopRun returned error: %v", err)
	}
	if stopped == nil {
		t.Fatal("expected stopped parent run")
	}
	if stopped.Status != agentruns.RunStatusCancelled {
		t.Fatalf("expected cancelled parent run, got %#v", stopped)
	}
	if len(fixture.managedStopper.stopped) != 1 || fixture.managedStopper.stopped[0] != "child-run-1" {
		t.Fatalf("expected managed stopper to cancel child-run-1, got %#v", fixture.managedStopper.stopped)
	}
	if !hasEventType(*stopped, "child_runs_cancelled") || !hasEventType(*stopped, "run_cancelled") {
		t.Fatalf("expected cancellation events, got %#v", stopped.Events)
	}
	if stopped.ID != parentRun.ID {
		t.Fatalf("expected same parent run id %q, got %q", parentRun.ID, stopped.ID)
	}
}

func TestRuntimeResetMachineClearsOwnedChatBinding(t *testing.T) {
	t.Parallel()

	fixture := newRuntimeFixture(t)
	_, err := fixture.runtime.StartRun("project-alpha", "workflow-a", nil, nil)
	if err != nil {
		t.Fatalf("StartRun returned error: %v", err)
	}

	resetRun, err := fixture.runtime.ResetMachine("project-alpha", "workflow-a", nil)
	if err != nil {
		t.Fatalf("ResetMachine returned error: %v", err)
	}
	if resetRun == nil {
		t.Fatal("expected reset parent run")
	}
	if resetRun.Outputs[outputKeyMachineStateCleared] != true {
		t.Fatalf("expected machineStateCleared=true, got %#v", resetRun.Outputs)
	}
	if !hasEventType(*resetRun, "run_reset") {
		t.Fatalf("expected run_reset event, got %#v", resetRun.Events)
	}
	chatID, err := fixture.projectRuntime.ChatSectionChatID("project-alpha", "chat-section")
	if err != nil {
		t.Fatalf("ChatSectionChatID returned error: %v", err)
	}
	if chatID != nil {
		t.Fatalf("expected cleared chat binding, got %#v", chatID)
	}
}

func TestRuntimeResetMachinePreservesContinueCurrentThreadBinding(t *testing.T) {
	t.Parallel()

	project := stateMachineRuntimeTestProject(t)
	project.StateMachineEdges[0].TargetAction.ThreadStrategy = projectstate.StateMachineThreadStrategyContinueCurrentThread
	fixture := newSignalRuntimeFixtureForProjectWithProfiles(
		t,
		project,
		nil,
		[]string{"chat-continue-current"},
		[]string{"child-run-1"},
	)

	if _, err := fixture.projectRuntime.SetChatSectionChatID(context.Background(), "project-alpha", "chat-section", stringPointer("chat-continue-current")); err != nil {
		t.Fatalf("seed chat-section chat id: %v", err)
	}
	if _, err := fixture.runtime.StartRun("project-alpha", "workflow-a", nil, nil); err != nil {
		t.Fatalf("StartRun returned error: %v", err)
	}

	resetRun, err := fixture.runtime.ResetMachine("project-alpha", "workflow-a", nil)
	if err != nil {
		t.Fatalf("ResetMachine returned error: %v", err)
	}
	if resetRun == nil {
		t.Fatal("expected reset parent run")
	}
	chatID, err := fixture.projectRuntime.ChatSectionChatID("project-alpha", "chat-section")
	if err != nil {
		t.Fatalf("ChatSectionChatID returned error: %v", err)
	}
	if chatID == nil || *chatID != "chat-continue-current" {
		t.Fatalf("expected continue-current-thread binding to survive reset, got %#v", chatID)
	}
	if got := outputMap(*resetRun, outputKeyOwnedChatBindings); len(got) != 0 {
		t.Fatalf("expected no owned chat binding for continue_current_thread reuse, got %#v", got)
	}
}

func TestRuntimeResetMachinePreservesManualChatSwitchAfterOwnedThread(t *testing.T) {
	t.Parallel()

	fixture := newRuntimeFixture(t)
	if _, err := fixture.runtime.StartRun("project-alpha", "workflow-a", nil, nil); err != nil {
		t.Fatalf("StartRun returned error: %v", err)
	}
	if _, err := fixture.projectRuntime.SetChatSectionChatID(context.Background(), "project-alpha", "chat-section", stringPointer("manual-chat")); err != nil {
		t.Fatalf("switch chat-section chat id manually: %v", err)
	}

	resetRun, err := fixture.runtime.ResetMachine("project-alpha", "workflow-a", nil)
	if err != nil {
		t.Fatalf("ResetMachine returned error: %v", err)
	}
	if resetRun == nil {
		t.Fatal("expected reset parent run")
	}
	if got := fixture.managedStopper.stopped; !slices.Equal(got, []string{"child-run-1"}) {
		t.Fatalf("expected active child run cancellation during reset, got %#v", got)
	}
	chatID, err := fixture.projectRuntime.ChatSectionChatID("project-alpha", "chat-section")
	if err != nil {
		t.Fatalf("ChatSectionChatID returned error: %v", err)
	}
	if chatID == nil || *chatID != "manual-chat" {
		t.Fatalf("expected manual chat switch to survive reset, got %#v", chatID)
	}
}

func TestRuntimeReportSignalActivatesMatchingSignalEdgesAndPersistsSignalState(t *testing.T) {
	t.Parallel()

	fixture := newSignalRuntimeFixture(t)

	started, err := fixture.runtime.StartRun("project-alpha", "workflow-signal", nil, nil)
	if err != nil {
		t.Fatalf("StartRun returned error: %v", err)
	}

	report, err := fixture.runtime.ReportSignal(
		"project-alpha",
		stringPointer("child-run-1"),
		nil,
		nil,
		"merge_decision",
		map[string]any{"decision": "retry"},
		nil,
	)
	if err != nil {
		t.Fatalf("ReportSignal returned error: %v", err)
	}
	if report["status"] != "ok" {
		t.Fatalf("expected ok report status, got %#v", report)
	}
	if report["childRunId"] != "child-run-1" {
		t.Fatalf("expected child-run-1 in signal report, got %#v", report)
	}
	if report["sourceSectionId"] != "chat-source" {
		t.Fatalf("expected chat-source in signal report, got %#v", report)
	}

	latest, err := fixture.runtime.GetLatestRun("project-alpha", "workflow-signal", nil)
	if err != nil {
		t.Fatalf("GetLatestRun returned error: %v", err)
	}
	if latest == nil {
		t.Fatal("expected latest workflow run after signal")
	}
	if got := outputStringList(*latest, outputKeyChildRunIDs); len(got) != 2 || got[0] != "child-run-1" || got[1] != "child-run-2" {
		t.Fatalf("expected both child runs to be tracked, got %#v", got)
	}
	if got := outputStringList(*latest, outputKeyProcessedSignalEventIDs); len(got) != 1 || got[0] != report["signalEventId"] {
		t.Fatalf("expected processed signal event id to persist, got %#v", got)
	}
	if got := outputIntMap(*latest, outputKeySourceActivationCounts); got["start-section"] != 1 || got["chat-source"] != 1 {
		t.Fatalf("expected start/chat source activation counts to increment, got %#v", got)
	}
	if got := outputListOfMaps(*latest, outputKeySignalEvents); len(got) != 1 {
		t.Fatalf("expected one persisted signal event, got %#v", got)
	} else {
		if got[0]["signalName"] != "merge_decision" {
			t.Fatalf("expected merge_decision signal event, got %#v", got[0])
		}
		if payload, ok := got[0]["payload"].(map[string]any); !ok || payload["decision"] != "retry" {
			t.Fatalf("expected retry payload, got %#v", got[0]["payload"])
		}
	}
	if got := outputListOfMaps(*latest, outputKeyDispatchedEdgeActions); len(got) != 1 || got[0]["runId"] != "child-run-2" {
		t.Fatalf("expected signal-dispatched child run child-run-2, got %#v", got)
	}
	if !hasEventType(*latest, "signal_reported") || !hasEventType(*latest, "signal_edges_activated") {
		t.Fatalf("expected signal lifecycle events, got %#v", latest.Events)
	}

	dispatchedChildRun, err := fixture.runs.Load("child-run-2")
	if err != nil {
		t.Fatalf("load signal-dispatched child run: %v", err)
	}
	if runInputString(dispatchedChildRun, inputKeyStateMachineTargetSection) != "chat-target" {
		t.Fatalf("expected signal-dispatched target section chat-target, got %#v", dispatchedChildRun.Inputs)
	}
	switch value := dispatchedChildRun.Inputs[inputKeyStateMachineSourceCount].(type) {
	case int:
		if value != 0 {
			t.Fatalf("expected signal-dispatched child run source activation count 0, got %#v", dispatchedChildRun.Inputs)
		}
	case float64:
		if value != 0 {
			t.Fatalf("expected signal-dispatched child run source activation count 0, got %#v", dispatchedChildRun.Inputs)
		}
	default:
		t.Fatalf("expected numeric signal-dispatched child run source activation count, got %#v", dispatchedChildRun.Inputs[inputKeyStateMachineSourceCount])
	}
	if latest.ID != started.ID {
		t.Fatalf("expected signal report to update parent run %q, got %q", started.ID, latest.ID)
	}
}

func TestRuntimeReportSignalRequiresActiveChildRunEvenWhenMachineRunAndSectionProvided(t *testing.T) {
	t.Parallel()

	fixture := newSignalRuntimeFixture(t)

	started, err := fixture.runtime.StartRun("project-alpha", "workflow-signal", nil, nil)
	if err != nil {
		t.Fatalf("StartRun returned error: %v", err)
	}

	_, err = fixture.runtime.ReportSignal(
		"project-alpha",
		nil,
		stringPointer(started.ID),
		stringPointer("chat-source"),
		"merge_decision",
		map[string]any{"decision": "retry"},
		nil,
	)
	if err == nil {
		t.Fatal("expected ReportSignal to reject missing active child run")
	}
	if err.Error() != "report_state_machine_signal requires an active child run." {
		t.Fatalf("unexpected ReportSignal error: %v", err)
	}
}

func TestRuntimeReportSignalKeepsGateWaitingWhileSourceChatRuns(t *testing.T) {
	t.Parallel()

	fixture := newSignalRuntimeFixtureForProjectWithProfiles(
		t,
		signalGateWaitingRuntimeTestProjectWithSourceAgentProfile(t, nil),
		nil,
		[]string{"chat-managed-1", "chat-managed-2"},
		[]string{"child-run-1", "child-run-2"},
	)

	if _, err := fixture.runtime.StartRun("project-alpha", "workflow-signal-gate", nil, nil); err != nil {
		t.Fatalf("StartRun returned error: %v", err)
	}

	report, err := fixture.runtime.ReportSignal(
		"project-alpha",
		stringPointer("child-run-1"),
		nil,
		nil,
		"merge_decision",
		map[string]any{"decision": "retry"},
		nil,
	)
	if err != nil {
		t.Fatalf("ReportSignal returned error: %v", err)
	}
	if report["status"] != "ok" {
		t.Fatalf("expected ok report status, got %#v", report)
	}

	latest, err := fixture.runtime.GetLatestRun("project-alpha", "workflow-signal-gate", nil)
	if err != nil {
		t.Fatalf("GetLatestRun returned error: %v", err)
	}
	if latest == nil {
		t.Fatal("expected latest workflow run after signal")
	}
	if got := outputStringList(*latest, outputKeyChildRunIDs); len(got) != 1 || got[0] != "child-run-1" {
		t.Fatalf("expected only the original child run while gate is waiting, got %#v", got)
	}
	if got := outputStringList(*latest, outputKeyActiveChildRunIDs); len(got) != 1 || got[0] != "child-run-1" {
		t.Fatalf("expected source child run to remain active, got %#v", got)
	}
	if got := outputMap(*latest, outputKeyGateStatuses)["gate-section"]; got != "waiting" {
		t.Fatalf("expected waiting gate status, got %#v", outputMap(*latest, outputKeyGateStatuses))
	}
	gateInputs, ok := rawOutputMap(*latest, outputKeyGateInputEdgeIDs)["gate-section"].([]any)
	if !ok || len(gateInputs) != 1 || gateInputs[0] != "edge-source-gate-signal" {
		t.Fatalf("expected only the signal edge to count toward the waiting gate, got %#v", rawOutputMap(*latest, outputKeyGateInputEdgeIDs))
	}
	if got := outputListOfMaps(*latest, outputKeyDispatchedEdgeActions); len(got) != 0 {
		t.Fatalf("expected no dispatched edges while gate remains waiting, got %#v", got)
	}
	if got := outputStringList(*latest, outputKeyProcessedSignalEventIDs); len(got) != 1 || got[0] != report["signalEventId"] {
		t.Fatalf("expected processed signal event id to persist, got %#v", got)
	}
	if got := outputIntMap(*latest, outputKeySourceActivationCounts); got["chat-source"] != 1 {
		t.Fatalf("expected source activation count to increment, got %#v", got)
	}
}

func TestRuntimeReportSignalCountsSourceActivationsForRetryLoop(t *testing.T) {
	t.Parallel()

	fixture := newSignalRuntimeFixtureForProjectWithProfiles(
		t,
		signalRetryLoopRuntimeTestProjectWithSourceAgentProfile(t, nil),
		nil,
		[]string{"chat-managed-1", "chat-managed-2", "chat-managed-3"},
		[]string{"child-run-1", "child-run-2", "child-run-3"},
	)

	if _, err := fixture.runtime.StartRun("project-alpha", "workflow-signal-retry", nil, nil); err != nil {
		t.Fatalf("StartRun returned error: %v", err)
	}

	firstReport, err := fixture.runtime.ReportSignal(
		"project-alpha",
		stringPointer("child-run-1"),
		nil,
		nil,
		"merge_decision",
		map[string]any{"decision": "retry"},
		nil,
	)
	if err != nil {
		t.Fatalf("first ReportSignal returned error: %v", err)
	}
	if firstReport["sourceActivationCount"] != 0 {
		t.Fatalf("expected first signal to report source activation count 0, got %#v", firstReport)
	}

	secondReport, err := fixture.runtime.ReportSignal(
		"project-alpha",
		stringPointer("child-run-2"),
		nil,
		nil,
		"merge_decision",
		map[string]any{"decision": "retry"},
		nil,
	)
	if err != nil {
		t.Fatalf("second ReportSignal returned error: %v", err)
	}
	if secondReport["sourceActivationCount"] != 1 {
		t.Fatalf("expected second signal to report source activation count 1, got %#v", secondReport)
	}

	latest, err := fixture.runtime.GetLatestRun("project-alpha", "workflow-signal-retry", nil)
	if err != nil {
		t.Fatalf("GetLatestRun returned error: %v", err)
	}
	if latest == nil {
		t.Fatal("expected latest workflow run after retry loop")
	}
	if got := outputStringList(*latest, outputKeyChildRunIDs); len(got) != 3 || got[0] != "child-run-1" || got[1] != "child-run-2" || got[2] != "child-run-3" {
		t.Fatalf("expected retry loop child runs to be tracked in order, got %#v", got)
	}
	if got := outputStringList(*latest, outputKeyProcessedSignalEventIDs); len(got) != 2 || got[0] != firstReport["signalEventId"] || got[1] != secondReport["signalEventId"] {
		t.Fatalf("expected both processed signal ids to persist, got %#v", got)
	}
	if got := outputIntMap(*latest, outputKeySourceActivationCounts); got["chat-source"] != 2 {
		t.Fatalf("expected chat-source activation count 2 after retry loop, got %#v", got)
	}
	if got := outputListOfMaps(*latest, outputKeyDispatchedEdgeActions); len(got) != 2 || got[0]["runId"] != "child-run-2" || got[1]["runId"] != "child-run-3" {
		t.Fatalf("expected two dispatched retry-loop edge actions, got %#v", got)
	}

	secondChildRun, err := fixture.runs.Load("child-run-2")
	if err != nil {
		t.Fatalf("load first retry-loop child run: %v", err)
	}
	switch value := secondChildRun.Inputs[inputKeyStateMachineSourceCount].(type) {
	case int:
		if value != 0 {
			t.Fatalf("expected first retry-loop child source count 0, got %#v", secondChildRun.Inputs)
		}
	case float64:
		if value != 0 {
			t.Fatalf("expected first retry-loop child source count 0, got %#v", secondChildRun.Inputs)
		}
	default:
		t.Fatalf("expected numeric first retry-loop source count, got %#v", secondChildRun.Inputs[inputKeyStateMachineSourceCount])
	}

	thirdChildRun, err := fixture.runs.Load("child-run-3")
	if err != nil {
		t.Fatalf("load second retry-loop child run: %v", err)
	}
	switch value := thirdChildRun.Inputs[inputKeyStateMachineSourceCount].(type) {
	case int:
		if value != 1 {
			t.Fatalf("expected second retry-loop child source count 1, got %#v", thirdChildRun.Inputs)
		}
	case float64:
		if value != 1 {
			t.Fatalf("expected second retry-loop child source count 1, got %#v", thirdChildRun.Inputs)
		}
	default:
		t.Fatalf("expected numeric second retry-loop source count, got %#v", thirdChildRun.Inputs[inputKeyStateMachineSourceCount])
	}
}

type runtimeFixture struct {
	runtime         *Runtime
	projectRuntime  *projectstate.Runtime
	runs            *agentruns.RunStore
	managedStarter  *recordingManagedChatStarter
	managedStopper  *recordingRunStopper
	parallelStarter *blockingManagedChatStarter
}

func newRuntimeFixture(t *testing.T) runtimeFixture {
	t.Helper()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": stateMachineRuntimeTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	runs, err := agentruns.NewRunStore(t.TempDir())
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	engines, err := agentruns.NewEngineStore(t.TempDir())
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	if err := engines.Write([]agentruns.EngineConfig{{
		ID:         "engine-managed",
		Name:       "Managed Engine",
		EngineType: agentruns.EngineTypeSettaLLM,
	}}); err != nil {
		t.Fatalf("write engine config: %v", err)
	}
	profiles := newTestAgentProfileStore(t, nil)

	managedStarter := &recordingManagedChatStarter{
		chatIDs: []string{"chat-managed-1"},
		runIDs:  []string{"child-run-1"},
		runs:    runs,
	}
	managedStopper := &recordingRunStopper{}
	runtime, err := NewRuntime(RuntimeOptions{
		Runs:     runs,
		Engines:  engines,
		Profiles: profiles,
		ResolveProjectRuntime: func(shareSessionID *string) (*projectstate.Runtime, error) {
			if shareSessionID != nil {
				t.Fatalf("unexpected share session lookup in foundation test: %#v", shareSessionID)
			}
			return projectRuntime, nil
		},
		ManagedChats: managedStarter,
		ManagedRuns:  managedStopper,
		TimeNow:      testNow,
	})
	if err != nil {
		t.Fatalf("NewRuntime returned error: %v", err)
	}

	return runtimeFixture{
		runtime:        runtime,
		projectRuntime: projectRuntime,
		runs:           runs,
		managedStarter: managedStarter,
		managedStopper: managedStopper,
	}
}

func newParallelStartRuntimeFixture(t *testing.T) runtimeFixture {
	t.Helper()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": parallelStartRuntimeTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	runs, err := agentruns.NewRunStore(t.TempDir())
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	engines, err := agentruns.NewEngineStore(t.TempDir())
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	if err := engines.Write([]agentruns.EngineConfig{{
		ID:         "engine-managed",
		Name:       "Managed Engine",
		EngineType: agentruns.EngineTypeSettaLLM,
	}}); err != nil {
		t.Fatalf("write engine config: %v", err)
	}
	profiles := newTestAgentProfileStore(t, nil)

	parallelStarter := newBlockingManagedChatStarter()
	runtime, err := NewRuntime(RuntimeOptions{
		Runs:     runs,
		Engines:  engines,
		Profiles: profiles,
		ResolveProjectRuntime: func(shareSessionID *string) (*projectstate.Runtime, error) {
			if shareSessionID != nil {
				t.Fatalf("unexpected share session lookup in parallel start test: %#v", shareSessionID)
			}
			return projectRuntime, nil
		},
		ManagedChats: parallelStarter,
		ManagedRuns:  &recordingRunStopper{},
		TimeNow:      testNow,
	})
	if err != nil {
		t.Fatalf("NewRuntime returned error: %v", err)
	}

	return runtimeFixture{
		runtime:         runtime,
		projectRuntime:  projectRuntime,
		runs:            runs,
		parallelStarter: parallelStarter,
	}
}

func newPromptSectionRuntimeFixture(t *testing.T, project projectstate.Project) runtimeFixture {
	t.Helper()

	return newSignalRuntimeFixtureForProjectWithProfiles(
		t,
		project,
		nil,
		[]string{"chat-managed-1"},
		[]string{"child-run-1"},
	)
}

func newFollowUpChatRuntimeFixture(t *testing.T) runtimeFixture {
	t.Helper()

	return newSignalRuntimeFixtureForProjectWithProfiles(
		t,
		followUpChatRuntimeTestProject(t),
		nil,
		[]string{"chat-managed-1", "chat-managed-2"},
		[]string{"child-run-1", "child-run-2"},
	)
}

func newSignalRuntimeFixture(t *testing.T) runtimeFixture {
	return newSignalRuntimeFixtureWithProfiles(t, nil)
}

func newSignalRuntimeFixtureWithProfiles(t *testing.T, profiles []agentprofiles.Profile) runtimeFixture {
	t.Helper()

	var agentProfileID *string
	if len(profiles) > 0 {
		agentProfileID = stringPointer(profiles[0].ID)
	}

	return newSignalRuntimeFixtureForProjectWithProfiles(
		t,
		signalStateMachineRuntimeTestProjectWithSourceAgentProfile(t, agentProfileID),
		profiles,
		[]string{"chat-managed-1", "chat-managed-2"},
		[]string{"child-run-1", "child-run-2"},
	)
}

func newSignalRuntimeFixtureForProjectWithProfiles(
	t *testing.T,
	project projectstate.Project,
	profiles []agentprofiles.Profile,
	chatIDs []string,
	runIDs []string,
) runtimeFixture {
	t.Helper()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": project,
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	runs, err := agentruns.NewRunStore(t.TempDir())
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	engines, err := agentruns.NewEngineStore(t.TempDir())
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	if err := engines.Write([]agentruns.EngineConfig{{
		ID:         "engine-managed",
		Name:       "Managed Engine",
		EngineType: agentruns.EngineTypeSettaLLM,
	}}); err != nil {
		t.Fatalf("write engine config: %v", err)
	}
	profileStore := newTestAgentProfileStore(t, profiles)

	managedStarter := &recordingManagedChatStarter{
		chatIDs: chatIDs,
		runIDs:  runIDs,
		runs:    runs,
	}
	managedStopper := &recordingRunStopper{}
	runtime, err := NewRuntime(RuntimeOptions{
		Runs:     runs,
		Engines:  engines,
		Profiles: profileStore,
		ResolveProjectRuntime: func(shareSessionID *string) (*projectstate.Runtime, error) {
			if shareSessionID != nil {
				t.Fatalf("unexpected share session lookup in signal foundation test: %#v", shareSessionID)
			}
			return projectRuntime, nil
		},
		ManagedChats: managedStarter,
		ManagedRuns:  managedStopper,
		TimeNow:      testNow,
	})
	if err != nil {
		t.Fatalf("NewRuntime returned error: %v", err)
	}

	return runtimeFixture{
		runtime:        runtime,
		projectRuntime: projectRuntime,
		runs:           runs,
		managedStarter: managedStarter,
		managedStopper: managedStopper,
	}
}

func stateMachineRuntimeTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"start-section": "start-variant",
			"gate-section":  "gate-variant",
			"end-section":   "end-variant",
			"chat-section":  "chat-variant",
		},
		Sections: map[string]projectstate.Section{
			"start-section": {ID: "start-section", Name: "Start Section", VariantIDs: []string{"start-variant"}, DefaultVariantID: "start-variant"},
			"gate-section":  {ID: "gate-section", Name: "Gate Section", VariantIDs: []string{"gate-variant"}, DefaultVariantID: "gate-variant"},
			"end-section":   {ID: "end-section", Name: "End Section", VariantIDs: []string{"end-variant"}, DefaultVariantID: "end-variant"},
			"chat-section":  {ID: "chat-section", Name: "Review Chat", VariantIDs: []string{"chat-variant"}, DefaultVariantID: "chat-variant"},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"start-variant": {ID: "start-variant", ImplID: "start-impl"},
			"gate-variant":  {ID: "gate-variant", ImplID: "gate-impl"},
			"end-variant":   {ID: "end-variant", ImplID: "end-impl"},
			"chat-variant":  {ID: "chat-variant", ImplID: "chat-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"start-impl": {ID: "start-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "start-impl",
				"type":           "StateMachineStart",
				"machineGroupId": "workflow-a",
				"label":          "Kickoff",
				"maxIterations":  nil,
			})},
			"gate-impl": {ID: "gate-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "gate-impl",
				"type":           "StateMachineGate",
				"machineGroupId": "workflow-a",
				"label":          "Review Gate",
				"gateType":       string(projectstate.StateMachineGateTypeAND),
				"ui":             map[string]any{"showDetails": false},
			})},
			"end-impl": {ID: "end-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "end-impl",
				"type":           "StateMachineEnd",
				"machineGroupId": "workflow-a",
				"label":          "Done",
			})},
			"chat-impl": {ID: "chat-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "chat-impl",
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"agentProfileId": nil,
				"permissionMode": "minimal",
				"searchEnabled":  true,
				"chatId":         nil,
			})},
		},
		StateMachineEdges: []projectstate.StateMachineEdge{
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
				ID:              "edge-chat-gate",
				MachineGroupID:  "workflow-a",
				SourceSectionID: "chat-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "gate-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type: projectstate.StateMachineSourceFilterTypeRunCompleted,
				},
			},
			{
				ID:              "edge-gate-end",
				MachineGroupID:  "workflow-a",
				SourceSectionID: "gate-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "end-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize workflow project: %v", err)
	}
	return project
}

func promptSectionStartRuntimeTestProject(
	t *testing.T,
	promptTemplateID *string,
	promptTemplate string,
	promptInputs map[string]string,
) projectstate.Project {
	t.Helper()

	promptTemplateValue := any(nil)
	if promptTemplateID != nil {
		promptTemplateValue = strings.TrimSpace(*promptTemplateID)
	}
	promptSectionID := "prompt-section"
	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"start-section": "start-variant",
			"chat-section":  "chat-variant",
			"end-section":   "end-variant",
			promptSectionID: "prompt-variant",
		},
		Sections: map[string]projectstate.Section{
			"start-section": {ID: "start-section", Name: "Start Section", VariantIDs: []string{"start-variant"}, DefaultVariantID: "start-variant"},
			"chat-section":  {ID: "chat-section", Name: "Review Chat", VariantIDs: []string{"chat-variant"}, DefaultVariantID: "chat-variant"},
			"end-section":   {ID: "end-section", Name: "Done", VariantIDs: []string{"end-variant"}, DefaultVariantID: "end-variant"},
			promptSectionID: {ID: promptSectionID, Name: "Prompt Section", VariantIDs: []string{"prompt-variant"}, DefaultVariantID: "prompt-variant"},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"start-variant":  {ID: "start-variant", ImplID: "start-impl"},
			"chat-variant":   {ID: "chat-variant", ImplID: "chat-impl"},
			"end-variant":    {ID: "end-variant", ImplID: "end-impl"},
			"prompt-variant": {ID: "prompt-variant", ImplID: "prompt-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"start-impl": {ID: "start-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "start-impl",
				"type":           "StateMachineStart",
				"machineGroupId": "workflow-prompt-section",
				"label":          "Kickoff",
			})},
			"chat-impl": {ID: "chat-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "chat-impl",
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"permissionMode": "minimal",
				"searchEnabled":  true,
				"chatId":         nil,
			})},
			"end-impl": {ID: "end-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "end-impl",
				"type":           "StateMachineEnd",
				"machineGroupId": "workflow-prompt-section",
				"label":          "Done",
			})},
			"prompt-impl": {ID: "prompt-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":               "prompt-impl",
				"type":             "Prompt",
				"promptTemplateId": promptTemplateValue,
				"template":         promptTemplate,
				"inputs":           map[string]string{},
				"format":           string(projectstate.PromptFormatJinja),
				"renderedText":     "",
				"missingVariables": []string{},
				"renderError":      nil,
			})},
		},
		StateMachineEdges: []projectstate.StateMachineEdge{
			{
				ID:              "edge-start-chat",
				MachineGroupID:  "workflow-prompt-section",
				SourceSectionID: "start-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:            projectstate.StateMachineTargetActionTypeSendPrompt,
					PromptSectionID: &promptSectionID,
					PromptInputs:    promptInputs,
					ThreadStrategy:  projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-chat-end",
				MachineGroupID:  "workflow-prompt-section",
				SourceSectionID: "chat-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "end-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type: projectstate.StateMachineSourceFilterTypeRunCompleted,
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize prompt-section workflow project: %v", err)
	}
	return project
}

func parallelStartRuntimeTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"start-section": "start-variant",
			"chat-a":        "chat-a-variant",
			"chat-b":        "chat-b-variant",
			"end-section":   "end-variant",
		},
		Sections: map[string]projectstate.Section{
			"start-section": {ID: "start-section", Name: "Start Section", VariantIDs: []string{"start-variant"}, DefaultVariantID: "start-variant"},
			"chat-a":        {ID: "chat-a", Name: "Chat A", VariantIDs: []string{"chat-a-variant"}, DefaultVariantID: "chat-a-variant"},
			"chat-b":        {ID: "chat-b", Name: "Chat B", VariantIDs: []string{"chat-b-variant"}, DefaultVariantID: "chat-b-variant"},
			"end-section":   {ID: "end-section", Name: "Done", VariantIDs: []string{"end-variant"}, DefaultVariantID: "end-variant"},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"start-variant":  {ID: "start-variant", ImplID: "start-impl"},
			"chat-a-variant": {ID: "chat-a-variant", ImplID: "chat-a-impl"},
			"chat-b-variant": {ID: "chat-b-variant", ImplID: "chat-b-impl"},
			"end-variant":    {ID: "end-variant", ImplID: "end-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"start-impl": {ID: "start-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "start-impl",
				"type":           "StateMachineStart",
				"machineGroupId": "workflow-parallel",
				"label":          "Kickoff",
			})},
			"chat-a-impl": {ID: "chat-a-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "chat-a-impl",
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"permissionMode": "minimal",
				"searchEnabled":  true,
			})},
			"chat-b-impl": {ID: "chat-b-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "chat-b-impl",
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"permissionMode": "minimal",
				"searchEnabled":  true,
			})},
			"end-impl": {ID: "end-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "end-impl",
				"type":           "StateMachineEnd",
				"machineGroupId": "workflow-parallel",
				"label":          "Done",
			})},
		},
		StateMachineEdges: []projectstate.StateMachineEdge{
			{
				ID:              "edge-start-chat-a",
				MachineGroupID:  "workflow-parallel",
				SourceSectionID: "start-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-a",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Prompt A"),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-start-chat-b",
				MachineGroupID:  "workflow-parallel",
				SourceSectionID: "start-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-b",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Prompt B"),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-chat-a-end",
				MachineGroupID:  "workflow-parallel",
				SourceSectionID: "chat-a",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "end-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type: projectstate.StateMachineSourceFilterTypeRunCompleted,
				},
			},
			{
				ID:              "edge-chat-b-end",
				MachineGroupID:  "workflow-parallel",
				SourceSectionID: "chat-b",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "end-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type: projectstate.StateMachineSourceFilterTypeRunCompleted,
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize parallel workflow project: %v", err)
	}
	return project
}

func followUpChatRuntimeTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"start-section": "start-variant",
			"chat-a":        "chat-a-variant",
			"chat-b":        "chat-b-variant",
			"end-section":   "end-variant",
		},
		Sections: map[string]projectstate.Section{
			"start-section": {ID: "start-section", Name: "Start Section", VariantIDs: []string{"start-variant"}, DefaultVariantID: "start-variant"},
			"chat-a":        {ID: "chat-a", Name: "Chat A", VariantIDs: []string{"chat-a-variant"}, DefaultVariantID: "chat-a-variant"},
			"chat-b":        {ID: "chat-b", Name: "Chat B", VariantIDs: []string{"chat-b-variant"}, DefaultVariantID: "chat-b-variant"},
			"end-section":   {ID: "end-section", Name: "Done", VariantIDs: []string{"end-variant"}, DefaultVariantID: "end-variant"},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"start-variant":  {ID: "start-variant", ImplID: "start-impl"},
			"chat-a-variant": {ID: "chat-a-variant", ImplID: "chat-a-impl"},
			"chat-b-variant": {ID: "chat-b-variant", ImplID: "chat-b-impl"},
			"end-variant":    {ID: "end-variant", ImplID: "end-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"start-impl": {ID: "start-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "start-impl",
				"type":           "StateMachineStart",
				"machineGroupId": "workflow-follow-up",
				"label":          "Kickoff",
			})},
			"chat-a-impl": {ID: "chat-a-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "chat-a-impl",
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"permissionMode": "minimal",
				"searchEnabled":  true,
				"chatId":         nil,
			})},
			"chat-b-impl": {ID: "chat-b-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "chat-b-impl",
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"permissionMode": "minimal",
				"searchEnabled":  true,
				"chatId":         nil,
			})},
			"end-impl": {ID: "end-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "end-impl",
				"type":           "StateMachineEnd",
				"machineGroupId": "workflow-follow-up",
				"label":          "Done",
			})},
		},
		StateMachineEdges: []projectstate.StateMachineEdge{
			{
				ID:              "edge-start-chat-a",
				MachineGroupID:  "workflow-follow-up",
				SourceSectionID: "start-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-a",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Review the draft."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-chat-a-chat-b",
				MachineGroupID:  "workflow-follow-up",
				SourceSectionID: "chat-a",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-b",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type: projectstate.StateMachineSourceFilterTypeRunCompleted,
				},
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Take the follow-up pass."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-chat-b-end",
				MachineGroupID:  "workflow-follow-up",
				SourceSectionID: "chat-b",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "end-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type: projectstate.StateMachineSourceFilterTypeRunCompleted,
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize follow-up workflow project: %v", err)
	}
	return project
}

func startOnlyRuntimeTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"start-section": "start-variant",
		},
		Sections: map[string]projectstate.Section{
			"start-section": {ID: "start-section", Name: "Start Section", VariantIDs: []string{"start-variant"}, DefaultVariantID: "start-variant"},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"start-variant": {ID: "start-variant", ImplID: "start-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"start-impl": {ID: "start-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "start-impl",
				"type":           "StateMachineStart",
				"machineGroupId": "workflow-start-only",
				"label":          "Draft Start",
			})},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize start-only workflow project: %v", err)
	}
	return project
}

func stalledRuntimeTestProject(t *testing.T, machineGroupID string) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"start-section": "start-variant",
			"chat-section":  "chat-variant",
			"end-section":   "end-variant",
		},
		Sections: map[string]projectstate.Section{
			"start-section": {ID: "start-section", Name: "Start Section", VariantIDs: []string{"start-variant"}, DefaultVariantID: "start-variant"},
			"chat-section":  {ID: "chat-section", Name: "Review Chat", VariantIDs: []string{"chat-variant"}, DefaultVariantID: "chat-variant"},
			"end-section":   {ID: "end-section", Name: "Done", VariantIDs: []string{"end-variant"}, DefaultVariantID: "end-variant"},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"start-variant": {ID: "start-variant", ImplID: "start-impl"},
			"chat-variant":  {ID: "chat-variant", ImplID: "chat-impl"},
			"end-variant":   {ID: "end-variant", ImplID: "end-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"start-impl": {ID: "start-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "start-impl",
				"type":           "StateMachineStart",
				"machineGroupId": machineGroupID,
				"label":          "Kickoff",
			})},
			"chat-impl": {ID: "chat-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "chat-impl",
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"permissionMode": "minimal",
				"searchEnabled":  true,
				"chatId":         nil,
			})},
			"end-impl": {ID: "end-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "end-impl",
				"type":           "StateMachineEnd",
				"machineGroupId": machineGroupID,
				"label":          "Done",
			})},
		},
		StateMachineEdges: []projectstate.StateMachineEdge{
			{
				ID:              "edge-start-chat",
				MachineGroupID:  machineGroupID,
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
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize stalled workflow project: %v", err)
	}
	return project
}

func gateRuntimeTestProject(
	t *testing.T,
	machineGroupID string,
	gateType projectstate.StateMachineGateType,
	sourceChatSectionIDs []string,
	gateTargetChatID *string,
) projectstate.Project {
	t.Helper()

	sectionVariantMap := map[string]string{
		"start-section": "start-variant",
		"gate-section":  "gate-variant",
		"end-section":   "end-variant",
	}
	sections := map[string]projectstate.Section{
		"start-section": {ID: "start-section", Name: "Start Section", VariantIDs: []string{"start-variant"}, DefaultVariantID: "start-variant"},
		"gate-section":  {ID: "gate-section", Name: "Gate Section", VariantIDs: []string{"gate-variant"}, DefaultVariantID: "gate-variant"},
		"end-section":   {ID: "end-section", Name: "End Section", VariantIDs: []string{"end-variant"}, DefaultVariantID: "end-variant"},
	}
	sectionVariants := map[string]projectstate.SectionVariant{
		"start-variant": {ID: "start-variant", ImplID: "start-impl"},
		"gate-variant":  {ID: "gate-variant", ImplID: "gate-impl"},
		"end-variant":   {ID: "end-variant", ImplID: "end-impl"},
	}
	sectionImpls := map[string]projectstate.SectionImpl{
		"start-impl": {ID: "start-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
			"id":             "start-impl",
			"type":           "StateMachineStart",
			"machineGroupId": machineGroupID,
			"label":          "Start",
		})},
		"gate-impl": {ID: "gate-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
			"id":             "gate-impl",
			"type":           "StateMachineGate",
			"machineGroupId": machineGroupID,
			"label":          "gate-section",
			"gateType":       string(gateType),
		})},
		"end-impl": {ID: "end-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
			"id":             "end-impl",
			"type":           "StateMachineEnd",
			"machineGroupId": machineGroupID,
			"label":          "Done",
		})},
	}
	edges := make([]projectstate.StateMachineEdge, 0, len(sourceChatSectionIDs)*2+2)
	for index, sectionID := range sourceChatSectionIDs {
		variantID := sectionID + "-variant"
		implID := sectionID + "-impl"
		sectionVariantMap[sectionID] = variantID
		sections[sectionID] = projectstate.Section{
			ID:               sectionID,
			Name:             strings.ToUpper(sectionID),
			VariantIDs:       []string{variantID},
			DefaultVariantID: variantID,
		}
		sectionVariants[variantID] = projectstate.SectionVariant{ID: variantID, ImplID: implID}
		sectionImpls[implID] = projectstate.SectionImpl{
			ID:   implID,
			Kind: projectstate.SectionKind("frontend"),
			Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             implID,
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"permissionMode": "minimal",
				"searchEnabled":  true,
				"chatId":         nil,
			}),
		}
		edges = append(edges,
			projectstate.StateMachineEdge{
				ID:              fmt.Sprintf("edge-start-%s", sectionID),
				MachineGroupID:  machineGroupID,
				SourceSectionID: "start-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: sectionID,
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer(fmt.Sprintf("Review branch %d.", index+1)),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			projectstate.StateMachineEdge{
				ID:              fmt.Sprintf("edge-%s-gate", sectionID),
				MachineGroupID:  machineGroupID,
				SourceSectionID: sectionID,
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "gate-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type: projectstate.StateMachineSourceFilterTypeRunCompleted,
				},
			},
		)
	}
	if gateTargetChatID != nil {
		sectionID := strings.TrimSpace(*gateTargetChatID)
		variantID := sectionID + "-variant"
		implID := sectionID + "-impl"
		sectionVariantMap[sectionID] = variantID
		sections[sectionID] = projectstate.Section{
			ID:               sectionID,
			Name:             strings.ToUpper(sectionID),
			VariantIDs:       []string{variantID},
			DefaultVariantID: variantID,
		}
		sectionVariants[variantID] = projectstate.SectionVariant{ID: variantID, ImplID: implID}
		sectionImpls[implID] = projectstate.SectionImpl{
			ID:   implID,
			Kind: projectstate.SectionKind("frontend"),
			Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             implID,
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"permissionMode": "minimal",
				"searchEnabled":  true,
				"chatId":         nil,
			}),
		}
		edges = append(edges,
			projectstate.StateMachineEdge{
				ID:              "edge-gate-chat-target",
				MachineGroupID:  machineGroupID,
				SourceSectionID: "gate-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: sectionID,
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Take the follow-up pass."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			projectstate.StateMachineEdge{
				ID:              "edge-chat-target-end",
				MachineGroupID:  machineGroupID,
				SourceSectionID: sectionID,
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "end-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type: projectstate.StateMachineSourceFilterTypeRunCompleted,
				},
			},
		)
	} else {
		edges = append(edges, projectstate.StateMachineEdge{
			ID:              "edge-gate-end",
			MachineGroupID:  machineGroupID,
			SourceSectionID: "gate-section",
			SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
			TargetSectionID: "end-section",
			TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
		})
	}

	project, err := projectstate.Project{
		ID:                "project-alpha",
		Name:              "Alpha",
		SectionVariantMap: sectionVariantMap,
		Sections:          sections,
		SectionVariants:   sectionVariants,
		SectionImpls:      sectionImpls,
		StateMachineEdges: edges,
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize gate workflow project: %v", err)
	}
	return project
}

func gateSourceCountLoopRuntimeTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"start-section": "start-variant",
			"gate-section":  "gate-variant",
			"end-section":   "end-variant",
			"chat-a":        "chat-a-variant",
			"chat-b":        "chat-b-variant",
			"chat-c":        "chat-c-variant",
		},
		Sections: map[string]projectstate.Section{
			"start-section": {ID: "start-section", Name: "Start Section", VariantIDs: []string{"start-variant"}, DefaultVariantID: "start-variant"},
			"gate-section":  {ID: "gate-section", Name: "Gate Section", VariantIDs: []string{"gate-variant"}, DefaultVariantID: "gate-variant"},
			"end-section":   {ID: "end-section", Name: "End Section", VariantIDs: []string{"end-variant"}, DefaultVariantID: "end-variant"},
			"chat-a":        {ID: "chat-a", Name: "Chat A", VariantIDs: []string{"chat-a-variant"}, DefaultVariantID: "chat-a-variant"},
			"chat-b":        {ID: "chat-b", Name: "Chat B", VariantIDs: []string{"chat-b-variant"}, DefaultVariantID: "chat-b-variant"},
			"chat-c":        {ID: "chat-c", Name: "Chat C", VariantIDs: []string{"chat-c-variant"}, DefaultVariantID: "chat-c-variant"},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"start-variant":  {ID: "start-variant", ImplID: "start-impl"},
			"gate-variant":   {ID: "gate-variant", ImplID: "gate-impl"},
			"end-variant":    {ID: "end-variant", ImplID: "end-impl"},
			"chat-a-variant": {ID: "chat-a-variant", ImplID: "chat-a-impl"},
			"chat-b-variant": {ID: "chat-b-variant", ImplID: "chat-b-impl"},
			"chat-c-variant": {ID: "chat-c-variant", ImplID: "chat-c-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"start-impl": {ID: "start-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "start-impl",
				"type":           "StateMachineStart",
				"machineGroupId": "workflow-source-count",
				"label":          "Start",
			})},
			"gate-impl": {ID: "gate-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "gate-impl",
				"type":           "StateMachineGate",
				"machineGroupId": "workflow-source-count",
				"label":          "gate-section",
				"gateType":       string(projectstate.StateMachineGateTypeAND),
			})},
			"end-impl": {ID: "end-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "end-impl",
				"type":           "StateMachineEnd",
				"machineGroupId": "workflow-source-count",
				"label":          "Done",
			})},
			"chat-a-impl": {ID: "chat-a-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "chat-a-impl",
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"permissionMode": "minimal",
				"searchEnabled":  true,
			})},
			"chat-b-impl": {ID: "chat-b-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "chat-b-impl",
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"permissionMode": "minimal",
				"searchEnabled":  true,
			})},
			"chat-c-impl": {ID: "chat-c-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "chat-c-impl",
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"permissionMode": "minimal",
				"searchEnabled":  true,
			})},
		},
		StateMachineEdges: []projectstate.StateMachineEdge{
			{
				ID:              "edge-start-chat-a",
				MachineGroupID:  "workflow-source-count",
				SourceSectionID: "start-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-a",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Review branch A."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-start-chat-b",
				MachineGroupID:  "workflow-source-count",
				SourceSectionID: "start-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-b",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Review branch B."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-start-chat-c",
				MachineGroupID:  "workflow-source-count",
				SourceSectionID: "start-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-c",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Review branch C."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-chat-a-gate",
				MachineGroupID:  "workflow-source-count",
				SourceSectionID: "chat-a",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "gate-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type: projectstate.StateMachineSourceFilterTypeRunCompleted,
				},
			},
			{
				ID:              "edge-chat-b-gate",
				MachineGroupID:  "workflow-source-count",
				SourceSectionID: "chat-b",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "gate-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type: projectstate.StateMachineSourceFilterTypeRunCompleted,
				},
			},
			{
				ID:              "edge-chat-c-gate",
				MachineGroupID:  "workflow-source-count",
				SourceSectionID: "chat-c",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "gate-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type: projectstate.StateMachineSourceFilterTypeRunCompleted,
				},
			},
			{
				ID:              "edge-gate-loop-a-first",
				MachineGroupID:  "workflow-source-count",
				SourceSectionID: "gate-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-a",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceActivationCountCondition: &projectstate.StateMachineSourceActivationCountCondition{
					Operator: projectstate.StateMachineCountOperatorEQ,
					Value:    0,
				},
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Retry branch A once."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-gate-loop-b-first",
				MachineGroupID:  "workflow-source-count",
				SourceSectionID: "gate-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-b",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceActivationCountCondition: &projectstate.StateMachineSourceActivationCountCondition{
					Operator: projectstate.StateMachineCountOperatorEQ,
					Value:    0,
				},
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Retry branch B once."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-gate-loop-c-first",
				MachineGroupID:  "workflow-source-count",
				SourceSectionID: "gate-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-c",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceActivationCountCondition: &projectstate.StateMachineSourceActivationCountCondition{
					Operator: projectstate.StateMachineCountOperatorEQ,
					Value:    0,
				},
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Retry branch C once."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-gate-loop-a-second",
				MachineGroupID:  "workflow-source-count",
				SourceSectionID: "gate-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-a",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceActivationCountCondition: &projectstate.StateMachineSourceActivationCountCondition{
					Operator: projectstate.StateMachineCountOperatorEQ,
					Value:    1,
				},
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Retry branch A twice."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-gate-loop-b-second",
				MachineGroupID:  "workflow-source-count",
				SourceSectionID: "gate-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-b",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceActivationCountCondition: &projectstate.StateMachineSourceActivationCountCondition{
					Operator: projectstate.StateMachineCountOperatorEQ,
					Value:    1,
				},
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Retry branch B twice."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-gate-loop-c-second",
				MachineGroupID:  "workflow-source-count",
				SourceSectionID: "gate-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-c",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceActivationCountCondition: &projectstate.StateMachineSourceActivationCountCondition{
					Operator: projectstate.StateMachineCountOperatorEQ,
					Value:    1,
				},
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Retry branch C twice."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-gate-end",
				MachineGroupID:  "workflow-source-count",
				SourceSectionID: "gate-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "end-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceActivationCountCondition: &projectstate.StateMachineSourceActivationCountCondition{
					Operator: projectstate.StateMachineCountOperatorEQ,
					Value:    2,
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize source-count workflow project: %v", err)
	}
	return project
}

func failedChildToEndRuntimeTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"start-section": "start-variant",
			"chat-a":        "chat-a-variant",
			"end-section":   "end-variant",
		},
		Sections: map[string]projectstate.Section{
			"start-section": {ID: "start-section", Name: "Start Section", VariantIDs: []string{"start-variant"}, DefaultVariantID: "start-variant"},
			"chat-a":        {ID: "chat-a", Name: "Chat A", VariantIDs: []string{"chat-a-variant"}, DefaultVariantID: "chat-a-variant"},
			"end-section":   {ID: "end-section", Name: "Done", VariantIDs: []string{"end-variant"}, DefaultVariantID: "end-variant"},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"start-variant":  {ID: "start-variant", ImplID: "start-impl"},
			"chat-a-variant": {ID: "chat-a-variant", ImplID: "chat-a-impl"},
			"end-variant":    {ID: "end-variant", ImplID: "end-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"start-impl": {ID: "start-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "start-impl",
				"type":           "StateMachineStart",
				"machineGroupId": "workflow-failed-end",
				"label":          "Kickoff",
			})},
			"chat-a-impl": {ID: "chat-a-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "chat-a-impl",
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"permissionMode": "minimal",
				"searchEnabled":  true,
				"chatId":         nil,
			})},
			"end-impl": {ID: "end-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "end-impl",
				"type":           "StateMachineEnd",
				"machineGroupId": "workflow-failed-end",
				"label":          "Done",
			})},
		},
		StateMachineEdges: []projectstate.StateMachineEdge{
			{
				ID:              "edge-start-chat-a",
				MachineGroupID:  "workflow-failed-end",
				SourceSectionID: "start-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-a",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Review the draft."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-chat-a-end-on-failure",
				MachineGroupID:  "workflow-failed-end",
				SourceSectionID: "chat-a",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "end-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type: projectstate.StateMachineSourceFilterTypeRunFailed,
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize failed-child end workflow project: %v", err)
	}
	return project
}

func signalGateWaitingRuntimeTestProjectWithSourceAgentProfile(t *testing.T, agentProfileID *string) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"start-section": "start-variant",
			"chat-source":   "chat-source-variant",
			"gate-section":  "gate-variant",
			"chat-target":   "chat-target-variant",
			"end-section":   "end-variant",
		},
		Sections: map[string]projectstate.Section{
			"start-section": {ID: "start-section", Name: "Start Section", VariantIDs: []string{"start-variant"}, DefaultVariantID: "start-variant"},
			"chat-source":   {ID: "chat-source", Name: "Review Chat", VariantIDs: []string{"chat-source-variant"}, DefaultVariantID: "chat-source-variant"},
			"gate-section":  {ID: "gate-section", Name: "Decision Gate", VariantIDs: []string{"gate-variant"}, DefaultVariantID: "gate-variant"},
			"chat-target":   {ID: "chat-target", Name: "Follow Up Chat", VariantIDs: []string{"chat-target-variant"}, DefaultVariantID: "chat-target-variant"},
			"end-section":   {ID: "end-section", Name: "Done", VariantIDs: []string{"end-variant"}, DefaultVariantID: "end-variant"},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"start-variant":       {ID: "start-variant", ImplID: "start-impl"},
			"chat-source-variant": {ID: "chat-source-variant", ImplID: "chat-source-impl"},
			"gate-variant":        {ID: "gate-variant", ImplID: "gate-impl"},
			"chat-target-variant": {ID: "chat-target-variant", ImplID: "chat-target-impl"},
			"end-variant":         {ID: "end-variant", ImplID: "end-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"start-impl": {ID: "start-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "start-impl",
				"type":           "StateMachineStart",
				"machineGroupId": "workflow-signal-gate",
				"label":          "Kickoff",
			})},
			"chat-source-impl": {ID: "chat-source-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "chat-source-impl",
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"agentProfileId": agentProfileID,
				"permissionMode": "minimal",
				"searchEnabled":  true,
				"chatId":         nil,
			})},
			"gate-impl": {ID: "gate-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "gate-impl",
				"type":           "StateMachineGate",
				"machineGroupId": "workflow-signal-gate",
				"label":          "Decision Gate",
				"gateType":       string(projectstate.StateMachineGateTypeAND),
			})},
			"chat-target-impl": {ID: "chat-target-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "chat-target-impl",
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"permissionMode": "minimal",
				"searchEnabled":  true,
				"chatId":         nil,
			})},
			"end-impl": {ID: "end-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "end-impl",
				"type":           "StateMachineEnd",
				"machineGroupId": "workflow-signal-gate",
				"label":          "Done",
			})},
		},
		StateMachineEdges: []projectstate.StateMachineEdge{
			{
				ID:              "edge-start-source-chat",
				MachineGroupID:  "workflow-signal-gate",
				SourceSectionID: "start-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-source",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Review the draft."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-source-gate-signal",
				MachineGroupID:  "workflow-signal-gate",
				SourceSectionID: "chat-source",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "gate-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type:         projectstate.StateMachineSourceFilterTypeSignal,
					SignalName:   stringPointer("merge_decision"),
					PayloadField: stringPointer("decision"),
					Equals:       stringPointer("retry"),
				},
			},
			{
				ID:              "edge-source-gate-complete",
				MachineGroupID:  "workflow-signal-gate",
				SourceSectionID: "chat-source",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "gate-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type: projectstate.StateMachineSourceFilterTypeRunCompleted,
				},
			},
			{
				ID:              "edge-gate-target-chat",
				MachineGroupID:  "workflow-signal-gate",
				SourceSectionID: "gate-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-target",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Act on the retry decision."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-target-end",
				MachineGroupID:  "workflow-signal-gate",
				SourceSectionID: "chat-target",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "end-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type: projectstate.StateMachineSourceFilterTypeRunCompleted,
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize signal gate workflow project: %v", err)
	}
	return project
}

func signalRetryLoopRuntimeTestProjectWithSourceAgentProfile(t *testing.T, agentProfileID *string) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"start-section": "start-variant",
			"chat-source":   "chat-source-variant",
			"end-section":   "end-variant",
		},
		Sections: map[string]projectstate.Section{
			"start-section": {ID: "start-section", Name: "Start Section", VariantIDs: []string{"start-variant"}, DefaultVariantID: "start-variant"},
			"chat-source":   {ID: "chat-source", Name: "Review Chat", VariantIDs: []string{"chat-source-variant"}, DefaultVariantID: "chat-source-variant"},
			"end-section":   {ID: "end-section", Name: "Done", VariantIDs: []string{"end-variant"}, DefaultVariantID: "end-variant"},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"start-variant":       {ID: "start-variant", ImplID: "start-impl"},
			"chat-source-variant": {ID: "chat-source-variant", ImplID: "chat-source-impl"},
			"end-variant":         {ID: "end-variant", ImplID: "end-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"start-impl": {ID: "start-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "start-impl",
				"type":           "StateMachineStart",
				"machineGroupId": "workflow-signal-retry",
				"label":          "Kickoff",
			})},
			"chat-source-impl": {ID: "chat-source-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "chat-source-impl",
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"agentProfileId": agentProfileID,
				"permissionMode": "minimal",
				"searchEnabled":  true,
				"chatId":         nil,
			})},
			"end-impl": {ID: "end-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "end-impl",
				"type":           "StateMachineEnd",
				"machineGroupId": "workflow-signal-retry",
				"label":          "Done",
			})},
		},
		StateMachineEdges: []projectstate.StateMachineEdge{
			{
				ID:              "edge-start-source-chat",
				MachineGroupID:  "workflow-signal-retry",
				SourceSectionID: "start-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-source",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Review the draft."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-source-retry-first",
				MachineGroupID:  "workflow-signal-retry",
				SourceSectionID: "chat-source",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-source",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type:         projectstate.StateMachineSourceFilterTypeSignal,
					SignalName:   stringPointer("merge_decision"),
					PayloadField: stringPointer("decision"),
					Equals:       stringPointer("retry"),
				},
				SourceActivationCountCondition: &projectstate.StateMachineSourceActivationCountCondition{
					Operator: projectstate.StateMachineCountOperatorEQ,
					Value:    0,
				},
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Retry once."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-source-retry-second",
				MachineGroupID:  "workflow-signal-retry",
				SourceSectionID: "chat-source",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-source",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type:         projectstate.StateMachineSourceFilterTypeSignal,
					SignalName:   stringPointer("merge_decision"),
					PayloadField: stringPointer("decision"),
					Equals:       stringPointer("retry"),
				},
				SourceActivationCountCondition: &projectstate.StateMachineSourceActivationCountCondition{
					Operator: projectstate.StateMachineCountOperatorEQ,
					Value:    1,
				},
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Retry twice."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-source-end",
				MachineGroupID:  "workflow-signal-retry",
				SourceSectionID: "chat-source",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "end-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type:         projectstate.StateMachineSourceFilterTypeSignal,
					SignalName:   stringPointer("merge_decision"),
					PayloadField: stringPointer("decision"),
					Equals:       stringPointer("done"),
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize signal retry workflow project: %v", err)
	}
	return project
}

func signalStateMachineRuntimeTestProject(t *testing.T) projectstate.Project {
	return signalStateMachineRuntimeTestProjectWithSourceAgentProfile(t, nil)
}

func signalStateMachineRuntimeTestProjectWithSourceAgentProfile(t *testing.T, agentProfileID *string) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"start-section": "start-variant",
			"chat-source":   "chat-source-variant",
			"chat-target":   "chat-target-variant",
			"end-section":   "end-variant",
		},
		Sections: map[string]projectstate.Section{
			"start-section": {ID: "start-section", Name: "Start Section", VariantIDs: []string{"start-variant"}, DefaultVariantID: "start-variant"},
			"chat-source":   {ID: "chat-source", Name: "Review Chat", VariantIDs: []string{"chat-source-variant"}, DefaultVariantID: "chat-source-variant"},
			"chat-target":   {ID: "chat-target", Name: "Follow Up Chat", VariantIDs: []string{"chat-target-variant"}, DefaultVariantID: "chat-target-variant"},
			"end-section":   {ID: "end-section", Name: "Done", VariantIDs: []string{"end-variant"}, DefaultVariantID: "end-variant"},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"start-variant":       {ID: "start-variant", ImplID: "start-impl"},
			"chat-source-variant": {ID: "chat-source-variant", ImplID: "chat-source-impl"},
			"chat-target-variant": {ID: "chat-target-variant", ImplID: "chat-target-impl"},
			"end-variant":         {ID: "end-variant", ImplID: "end-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"start-impl": {ID: "start-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "start-impl",
				"type":           "StateMachineStart",
				"machineGroupId": "workflow-signal",
				"label":          "Kickoff",
			})},
			"chat-source-impl": {ID: "chat-source-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "chat-source-impl",
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"agentProfileId": agentProfileID,
				"permissionMode": "minimal",
				"searchEnabled":  true,
				"chatId":         nil,
			})},
			"chat-target-impl": {ID: "chat-target-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "chat-target-impl",
				"type":           "Chat",
				"engineConfigId": "engine-managed",
				"permissionMode": "minimal",
				"searchEnabled":  true,
				"chatId":         nil,
			})},
			"end-impl": {ID: "end-impl", Kind: projectstate.SectionKind("frontend"), Payload: mustMarshalStateMachineRuntimeObject(t, map[string]any{
				"id":             "end-impl",
				"type":           "StateMachineEnd",
				"machineGroupId": "workflow-signal",
				"label":          "Done",
			})},
		},
		StateMachineEdges: []projectstate.StateMachineEdge{
			{
				ID:              "edge-start-source-chat",
				MachineGroupID:  "workflow-signal",
				SourceSectionID: "start-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-source",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Review the draft."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-source-chat-retry",
				MachineGroupID:  "workflow-signal",
				SourceSectionID: "chat-source",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "chat-target",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type:         projectstate.StateMachineSourceFilterTypeSignal,
					SignalName:   stringPointer("merge_decision"),
					PayloadField: stringPointer("decision"),
					Equals:       stringPointer("retry"),
				},
				TargetAction: &projectstate.StateMachineTargetAction{
					Type:           projectstate.StateMachineTargetActionTypeSendPrompt,
					InlinePrompt:   stringPointer("Try another approach."),
					ThreadStrategy: projectstate.StateMachineThreadStrategyNewThreadBeforeSend,
				},
			},
			{
				ID:              "edge-source-chat-end",
				MachineGroupID:  "workflow-signal",
				SourceSectionID: "chat-source",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "end-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type:         projectstate.StateMachineSourceFilterTypeSignal,
					SignalName:   stringPointer("merge_decision"),
					PayloadField: stringPointer("decision"),
					Equals:       stringPointer("done"),
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize signal workflow project: %v", err)
	}
	return project
}

func mustMarshalStateMachineRuntimeObject(t *testing.T, value map[string]any) projectstate.RawJSON {
	t.Helper()

	content, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal section payload: %v", err)
	}
	return content
}

func hasEventType(run agentruns.Run, eventType string) bool {
	for _, event := range run.Events {
		if event.Type == eventType {
			return true
		}
	}
	return false
}

func eventTypes(run agentruns.Run) []string {
	result := make([]string, 0, len(run.Events))
	for _, event := range run.Events {
		result = append(result, event.Type)
	}
	return result
}

func sameStringMembers(got []string, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	gotCounts := make(map[string]int, len(got))
	for _, value := range got {
		gotCounts[value]++
	}
	for _, value := range want {
		if gotCounts[value] == 0 {
			return false
		}
		gotCounts[value]--
		if gotCounts[value] == 0 {
			delete(gotCounts, value)
		}
	}
	return len(gotCounts) == 0
}

func setChildRunStatus(t *testing.T, fixture runtimeFixture, childRunID string, status agentruns.RunStatus) agentruns.Run {
	t.Helper()

	childRun, err := fixture.runs.Load(childRunID)
	if err != nil {
		t.Fatalf("load child run %q: %v", childRunID, err)
	}
	childRun.Status = status
	if status != agentruns.RunStatusRunning {
		finishedAt := testNow()
		childRun.FinishedAt = &finishedAt
	}
	if err := fixture.runs.Save(childRun); err != nil {
		t.Fatalf("save child run %q with status %q: %v", childRunID, status, err)
	}
	return childRun
}

func anySliceToStrings(values []any) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		entry, ok := value.(string)
		if !ok {
			continue
		}
		result = append(result, entry)
	}
	return result
}

func numericInputValue(t *testing.T, run agentruns.Run, key string) int {
	t.Helper()

	value, ok := run.Inputs[key]
	if !ok {
		t.Fatalf("expected input %q on run %#v", key, run.Inputs)
	}
	switch typed := value.(type) {
	case int:
		return typed
	case float64:
		return int(typed)
	default:
		t.Fatalf("expected numeric input %q, got %#v", key, value)
		return 0
	}
}

func testNow() time.Time {
	return time.Date(2026, 3, 14, 18, 0, 0, 0, time.UTC)
}

func newTestAgentProfileStore(t *testing.T, profiles []agentprofiles.Profile) *agentprofiles.Store {
	t.Helper()

	store, err := agentprofiles.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new agent profile store: %v", err)
	}
	if err := store.Write(profiles); err != nil {
		t.Fatalf("write agent profiles: %v", err)
	}
	return store
}

func containsAll(value string, substrings ...string) bool {
	for _, substring := range substrings {
		if !strings.Contains(value, substring) {
			return false
		}
	}
	return true
}
