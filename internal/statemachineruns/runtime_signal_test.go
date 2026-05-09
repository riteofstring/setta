package statemachineruns

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"testing"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/externalagents"
	"setta/internal/projectstate"
	"setta/internal/prompttemplates"
)

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

func TestRuntimeStopRunningChildRunsStopsExternalAndMissingChildren(t *testing.T) {
	t.Parallel()

	fixture := newRuntimeFixture(t)

	externalChildRun := agentruns.NewRun(nil, map[string]any{
		"runType":         externalagents.RunTypeExternalAgent,
		"projectConfigId": "project-alpha",
	}, testNow())
	externalChildRun.ID = "external-child-run"
	externalChildRun.Status = agentruns.RunStatusRunning
	if err := fixture.runs.Save(externalChildRun); err != nil {
		t.Fatalf("save external child run: %v", err)
	}

	parentRun := agentruns.NewRun(nil, nil, testNow())
	parentRun.Outputs = map[string]any{
		outputKeyActiveChildRunIDs: []any{"missing-child-run", "external-child-run"},
	}

	stoppedRunIDs, err := fixture.runtime.stopRunningChildRuns(parentRun)
	if err != nil {
		t.Fatalf("stopRunningChildRuns returned error: %v", err)
	}
	if got := stoppedRunIDs; !slices.Equal(got, []string{"missing-child-run", "external-child-run"}) {
		t.Fatalf("expected missing and external child run ids to be reported, got %#v", got)
	}
	if got := fixture.externalStopper.stopped; !slices.Equal(got, []string{"external-child-run"}) {
		t.Fatalf("expected external stopper to stop external child run, got %#v", got)
	}
	if got := fixture.managedStopper.stopped; len(got) != 0 {
		t.Fatalf("expected no managed child-run stop calls, got %#v", got)
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
	externalStopper *recordingRunStopper
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
	externalStopper := &recordingRunStopper{}
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
		ExternalRuns: externalStopper,
		TimeNow:      testNow,
	})
	if err != nil {
		t.Fatalf("NewRuntime returned error: %v", err)
	}

	return runtimeFixture{
		runtime:         runtime,
		projectRuntime:  projectRuntime,
		runs:            runs,
		managedStarter:  managedStarter,
		managedStopper:  managedStopper,
		externalStopper: externalStopper,
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
	externalStopper := &recordingRunStopper{}
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
		ExternalRuns: externalStopper,
		TimeNow:      testNow,
	})
	if err != nil {
		t.Fatalf("NewRuntime returned error: %v", err)
	}

	return runtimeFixture{
		runtime:         runtime,
		projectRuntime:  projectRuntime,
		runs:            runs,
		externalStopper: externalStopper,
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
	externalStopper := &recordingRunStopper{}
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
		ExternalRuns: externalStopper,
		TimeNow:      testNow,
	})
	if err != nil {
		t.Fatalf("NewRuntime returned error: %v", err)
	}

	return runtimeFixture{
		runtime:         runtime,
		projectRuntime:  projectRuntime,
		runs:            runs,
		managedStarter:  managedStarter,
		managedStopper:  managedStopper,
		externalStopper: externalStopper,
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
				"format":           string(prompttemplates.FormatJinja),
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
