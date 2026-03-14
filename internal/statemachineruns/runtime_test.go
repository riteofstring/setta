package statemachineruns

import (
	"encoding/json"
	"testing"
	"time"

	"setta/internal/agentruns"
	"setta/internal/managedchat"
	"setta/internal/projectstate"
)

type recordingManagedChatStarter struct {
	chatIDs  []string
	runIDs   []string
	requests []managedchat.StartChatRequest
	calls    int
}

func (s *recordingManagedChatStarter) StartChat(request managedchat.StartChatRequest) (managedchat.StartChatResult, error) {
	s.requests = append(s.requests, request)
	index := s.calls
	s.calls++
	chatID := s.nextChatID(index)
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
	stopped []string
}

func (s *recordingRunStopper) StopRun(runID string) (agentruns.Run, error) {
	s.stopped = append(s.stopped, runID)
	run := agentruns.NewRun(nil, map[string]any{}, testNow())
	run.ID = runID
	run.Status = agentruns.RunStatusCancelled
	return run, nil
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

type runtimeFixture struct {
	runtime        *Runtime
	projectRuntime *projectstate.Runtime
	runs           *agentruns.RunStore
	managedStarter *recordingManagedChatStarter
	managedStopper *recordingRunStopper
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

	managedStarter := &recordingManagedChatStarter{
		chatIDs: []string{"chat-managed-1"},
		runIDs:  []string{"child-run-1"},
	}
	managedStopper := &recordingRunStopper{}
	runtime, err := NewRuntime(RuntimeOptions{
		Runs:    runs,
		Engines: engines,
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

func newSignalRuntimeFixture(t *testing.T) runtimeFixture {
	t.Helper()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": signalStateMachineRuntimeTestProject(t),
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

	managedStarter := &recordingManagedChatStarter{
		chatIDs: []string{"chat-managed-1", "chat-managed-2"},
		runIDs:  []string{"child-run-1", "child-run-2"},
	}
	managedStopper := &recordingRunStopper{}
	runtime, err := NewRuntime(RuntimeOptions{
		Runs:    runs,
		Engines: engines,
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

func signalStateMachineRuntimeTestProject(t *testing.T) projectstate.Project {
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

func testNow() time.Time {
	return time.Date(2026, 3, 14, 18, 0, 0, 0, time.UTC)
}
