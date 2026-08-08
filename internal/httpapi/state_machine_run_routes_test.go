package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/config"
	"setta/internal/llmconfig"
	"setta/internal/managedchat"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/statemachineruns"
)

func TestRegisterStateMachineRunRoutesStartGetStopAndResetInIDE(t *testing.T) {
	t.Parallel()

	fixture := newStateMachineRunRouteFixture(t, config.ModeIDE)

	started := startStateMachineWorkflowRouteRun(t, fixture, stringPointer("start-section"))
	assertRunningStateMachineWorkflowRun(t, started)

	latest := getStateMachineWorkflowRouteRun(t, fixture, http.StatusOK)
	assertLatestStateMachineWorkflowRun(t, latest, started)

	stopped := stopStateMachineWorkflowRouteRun(t, fixture)
	assertStateMachineWorkflowStoppedRun(t, stopped, started.ID)

	alreadyStopped := stopStateMachineWorkflowRouteRun(t, fixture)
	assertAlreadyStoppedStateMachineWorkflowRun(t, alreadyStopped)

	restarted := startStateMachineWorkflowRouteRun(t, fixture, nil)
	assertStateMachineWorkflowRestarted(t, restarted, started.ID)

	reset := resetStateMachineWorkflowRouteRun(t, fixture)
	assertStateMachineWorkflowResetResponse(t, reset, restarted.ID)

	assertMissingStateMachineWorkflowRouteRun(t, fixture)
	assertManagedWorkflowChildrenStopped(t, fixture)
}

func TestRegisterStateMachineRunRoutesCompletesStructuralMachineAndRestart(t *testing.T) {
	t.Parallel()

	fixture := newStateMachineRunRouteFixture(t, config.ModeIDE)
	seedStructuralWorkflowRouteEdges(t, fixture)

	started := startStateMachineWorkflowRouteRun(t, fixture, stringPointer("start-section"))
	assertCompletedStructuralWorkflowRun(t, started)
	if len(fixture.managedStarter.requests) != 0 {
		t.Fatalf("expected no managed chat dispatch for structural workflow, got %#v", fixture.managedStarter.requests)
	}

	latest := getStateMachineWorkflowRouteRun(t, fixture, http.StatusOK)
	assertLatestStructuralWorkflowRun(t, latest, started)

	stopped := stopStateMachineWorkflowRouteRun(t, fixture)
	assertAlreadyStoppedStateMachineWorkflowRun(t, stopped)

	restarted := startStateMachineWorkflowRouteRun(t, fixture, nil)
	if restarted.ID == started.ID {
		t.Fatalf("expected a new structural workflow run after restart, got %#v", restarted)
	}
	if restarted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected restarted structural workflow to complete, got %#v", restarted)
	}

	reset := resetStateMachineWorkflowRouteRun(t, fixture)
	assertStateMachineWorkflowResetResponse(t, reset, restarted.ID)

	missingResponse := stateMachineRunRouteRequest(t, fixture.handler, RouteGetStateMachineRun, GetStateMachineRunRequest{
		ProjectConfigID: "project-alpha",
		MachineGroupID:  "workflow-a",
	}, http.StatusNotFound)
	stateMachineRouteErrorCode(t, missingResponse, "state_machine_run_not_found")

	resetRun, err := fixture.runs.Load(restarted.ID)
	if err != nil {
		t.Fatalf("load reset structural workflow run: %v", err)
	}
	assertResetStructuralWorkflowRun(t, resetRun)
	if len(fixture.managedStopper.stopped) != 0 {
		t.Fatalf("expected no managed child stops for structural workflow, got %#v", fixture.managedStopper.stopped)
	}
}

func seedStructuralWorkflowRouteEdges(t *testing.T, fixture stateMachineRunRouteFixture) {
	t.Helper()

	if _, err := fixture.projectRuntime.SetStateMachineEdges(context.Background(), "project-alpha", []projectstate.StateMachineEdge{
		{
			ID:              "edge-start-gate",
			MachineGroupID:  "workflow-a",
			SourceSectionID: "start-section",
			SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
			TargetSectionID: "gate-section",
			TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
		},
		{
			ID:              "edge-gate-end",
			MachineGroupID:  "workflow-a",
			SourceSectionID: "gate-section",
			SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
			TargetSectionID: "end-section",
			TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
		},
	}, nil); err != nil {
		t.Fatalf("seed structural workflow edges: %v", err)
	}
}

func startStateMachineWorkflowRouteRun(t *testing.T, fixture stateMachineRunRouteFixture, startSectionID *string) agentruns.Run {
	t.Helper()

	response := stateMachineRunRouteRequest(t, fixture.handler, RouteStartStateMachineRun, StartStateMachineRunRequest{
		ProjectConfigID: "project-alpha",
		MachineGroupID:  "workflow-a",
		StartSectionID:  startSectionID,
	}, http.StatusOK)
	var run agentruns.Run
	if err := json.Unmarshal(response.Body.Bytes(), &run); err != nil {
		t.Fatalf("decode workflow run: %v", err)
	}
	return run
}

func getStateMachineWorkflowRouteRun(t *testing.T, fixture stateMachineRunRouteFixture, expectedStatus int) agentruns.Run {
	t.Helper()

	response := stateMachineRunRouteRequest(t, fixture.handler, RouteGetStateMachineRun, GetStateMachineRunRequest{
		ProjectConfigID: "project-alpha",
		MachineGroupID:  "workflow-a",
	}, expectedStatus)
	var run agentruns.Run
	if err := json.Unmarshal(response.Body.Bytes(), &run); err != nil {
		t.Fatalf("decode latest workflow run: %v", err)
	}
	return run
}

func stopStateMachineWorkflowRouteRun(t *testing.T, fixture stateMachineRunRouteFixture) StateMachineRunControlResponse {
	t.Helper()

	response := stateMachineRunRouteRequest(t, fixture.handler, RouteStopStateMachineRun, StopStateMachineRunRequest{
		ProjectConfigID: "project-alpha",
		MachineGroupID:  "workflow-a",
	}, http.StatusOK)
	var control StateMachineRunControlResponse
	if err := json.Unmarshal(response.Body.Bytes(), &control); err != nil {
		t.Fatalf("decode stop response: %v", err)
	}
	return control
}

func resetStateMachineWorkflowRouteRun(t *testing.T, fixture stateMachineRunRouteFixture) StateMachineRunControlResponse {
	t.Helper()

	response := stateMachineRunRouteRequest(t, fixture.handler, RouteResetStateMachine, ResetStateMachineRequest{
		ProjectConfigID: "project-alpha",
		MachineGroupID:  "workflow-a",
	}, http.StatusOK)
	var control StateMachineRunControlResponse
	if err := json.Unmarshal(response.Body.Bytes(), &control); err != nil {
		t.Fatalf("decode reset response: %v", err)
	}
	return control
}

func assertRunningStateMachineWorkflowRun(t *testing.T, run agentruns.Run) {
	t.Helper()

	if run.Status != agentruns.RunStatusRunning {
		t.Fatalf("expected running workflow run, got %#v", run)
	}
	if got := run.Inputs["runType"]; got != statemachineruns.RunTypeStateMachine {
		t.Fatalf("expected workflow run type, got %#v", run.Inputs)
	}
}

func assertLatestStateMachineWorkflowRun(t *testing.T, latest agentruns.Run, started agentruns.Run) {
	t.Helper()

	if latest.ID != started.ID {
		t.Fatalf("expected latest run %q, got %#v", started.ID, latest)
	}
}

func assertStateMachineWorkflowStoppedRun(t *testing.T, stopped StateMachineRunControlResponse, expectedStoppedRunID string) {
	t.Helper()

	if stopped.AlreadyStopped {
		t.Fatalf("expected running workflow to stop, got %#v", stopped)
	}
	if stopped.StoppedRunID == nil || *stopped.StoppedRunID != expectedStoppedRunID {
		t.Fatalf("expected stopped run id %q, got %#v", expectedStoppedRunID, stopped)
	}
}

func assertStateMachineWorkflowRestarted(t *testing.T, restarted agentruns.Run, previousRunID string) {
	t.Helper()

	if restarted.ID == previousRunID {
		t.Fatalf("expected a new workflow run after stop, got %#v", restarted)
	}
}

func assertMissingStateMachineWorkflowRouteRun(t *testing.T, fixture stateMachineRunRouteFixture) {
	t.Helper()

	missingResponse := stateMachineRunRouteRequest(t, fixture.handler, RouteGetStateMachineRun, GetStateMachineRunRequest{
		ProjectConfigID: "project-alpha",
		MachineGroupID:  "workflow-a",
	}, http.StatusNotFound)
	stateMachineRouteErrorCode(t, missingResponse, "state_machine_run_not_found")
}

func assertManagedWorkflowChildrenStopped(t *testing.T, fixture stateMachineRunRouteFixture) {
	t.Helper()

	if len(fixture.managedStopper.stopped) != 2 {
		t.Fatalf("expected both workflow child runs to be cancelled, got %#v", fixture.managedStopper.stopped)
	}
}

func assertCompletedStructuralWorkflowRun(t *testing.T, run agentruns.Run) {
	t.Helper()

	if run.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed structural workflow run, got %#v", run)
	}
	if got := run.Inputs["runType"]; got != statemachineruns.RunTypeStateMachine {
		t.Fatalf("expected workflow run type, got %#v", run.Inputs)
	}
	if got := run.Inputs["projectConfigId"]; got != "project-alpha" {
		t.Fatalf("expected project-alpha project config id, got %#v", run.Inputs)
	}
	if got := run.Inputs["machineGroupId"]; got != "workflow-a" {
		t.Fatalf("expected workflow-a machine group id, got %#v", run.Inputs)
	}
	if got := run.Inputs["startSectionId"]; got != "start-section" {
		t.Fatalf("expected start-section start section id, got %#v", run.Inputs)
	}
	if got := run.Inputs["machineName"]; got != "Start" {
		t.Fatalf("expected machine name from graph, got %#v", run.Inputs)
	}
	assertStructuralWorkflowOutputs(t, run)
	assertStructuralWorkflowEvents(t, run)
}

func assertStructuralWorkflowOutputs(t *testing.T, run agentruns.Run) {
	t.Helper()

	if got := stateMachineRunOutputStringSlice(t, run, "startOutgoingTargetSectionIds"); !slices.Equal(got, []string{"gate-section"}) {
		t.Fatalf("expected gate-section start outgoing target, got %#v", got)
	}
	if actions, ok := run.Outputs["dispatchedStartEdgeActions"].([]any); !ok || len(actions) != 0 {
		t.Fatalf("expected no dispatched start edge actions, got %#v", run.Outputs["dispatchedStartEdgeActions"])
	}
	if got := stateMachineRunOutputStringSlice(t, run, "firedGateSectionIds"); !slices.Equal(got, []string{"gate-section"}) {
		t.Fatalf("expected fired gate-section output, got %#v", got)
	}
	gateStatuses, ok := run.Outputs["gateStatusBySectionId"].(map[string]any)
	if !ok || len(gateStatuses) != 1 || gateStatuses["gate-section"] != "satisfied" {
		t.Fatalf("expected satisfied gate status, got %#v", run.Outputs["gateStatusBySectionId"])
	}
	if got := stateMachineRunOutputStringSlice(t, run, "reachedEndSectionIds"); !slices.Equal(got, []string{"end-section"}) {
		t.Fatalf("expected end-section reached output, got %#v", got)
	}
}

func assertStructuralWorkflowEvents(t *testing.T, run agentruns.Run) {
	t.Helper()

	if got := stateMachineRunEventTypes(run); !slices.Equal(got, []string{
		"run_started",
		"graph_resolved",
		"start_edges_activated",
		"gate_input_activated",
		"gate_satisfied",
		"end_reached",
		"run_completed",
	}) {
		t.Fatalf("expected structural workflow event sequence, got %#v", got)
	}
}

func assertLatestStructuralWorkflowRun(t *testing.T, latest agentruns.Run, started agentruns.Run) {
	t.Helper()

	if latest.ID != started.ID || latest.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected latest structural workflow run %#v, got %#v", started, latest)
	}
}

func assertAlreadyStoppedStateMachineWorkflowRun(t *testing.T, stopped StateMachineRunControlResponse) {
	t.Helper()

	if !stopped.AlreadyStopped || stopped.StoppedRunID != nil {
		t.Fatalf("expected already-stopped workflow response, got %#v", stopped)
	}
}

func assertStateMachineWorkflowResetResponse(t *testing.T, reset StateMachineRunControlResponse, expectedStoppedRunID string) {
	t.Helper()

	if reset.AlreadyStopped {
		t.Fatalf("expected reset to clear latest workflow run, got %#v", reset)
	}
	if reset.StoppedRunID == nil || *reset.StoppedRunID != expectedStoppedRunID {
		t.Fatalf("expected reset to target restarted run %q, got %#v", expectedStoppedRunID, reset)
	}
}

func assertResetStructuralWorkflowRun(t *testing.T, resetRun agentruns.Run) {
	t.Helper()

	if resetRun.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed reset run record, got %#v", resetRun)
	}
	if resetRun.Outputs["machineStateCleared"] != true {
		t.Fatalf("expected machineStateCleared=true, got %#v", resetRun.Outputs)
	}
	if _, ok := resetRun.Outputs["machineStateClearedAt"].(string); !ok {
		t.Fatalf("expected machineStateClearedAt timestamp, got %#v", resetRun.Outputs)
	}
	if got := stateMachineRunOutputStringSlice(t, resetRun, "activatedEdgeIds"); len(got) != 0 {
		t.Fatalf("expected cleared activatedEdgeIds, got %#v", got)
	}
	if got := stateMachineRunOutputStringSlice(t, resetRun, "firedGateSectionIds"); len(got) != 0 {
		t.Fatalf("expected cleared firedGateSectionIds, got %#v", got)
	}
	if got := stateMachineRunOutputStringSlice(t, resetRun, "reachedEndSectionIds"); len(got) != 0 {
		t.Fatalf("expected cleared reachedEndSectionIds, got %#v", got)
	}
	if resetRun.Outputs["failureSummary"] != nil {
		t.Fatalf("expected cleared failureSummary, got %#v", resetRun.Outputs)
	}
	if got := stateMachineRunEventTypes(resetRun); got[len(got)-1] != "run_reset" {
		t.Fatalf("expected run_reset as final event, got %#v", got)
	}
}

func TestRegisterStateMachineRunRoutesUsesActiveShareSessionForGet(t *testing.T) {
	t.Parallel()

	fixture := newStateMachineRunRouteFixture(t, config.ModeShare)

	for _, run := range []agentruns.Run{
		newStateMachineRouteTestRun("run-shareless", "project-alpha", "workflow-a", "", time.Date(2026, 3, 14, 20, 0, 0, 0, time.UTC)),
		newStateMachineRouteTestRun("run-share-b", "project-alpha", "workflow-a", "share-b", time.Date(2026, 3, 14, 20, 1, 0, 0, time.UTC)),
		newStateMachineRouteTestRun("run-share-a", "project-alpha", "workflow-a", "share-a", time.Date(2026, 3, 14, 20, 2, 0, 0, time.UTC)),
	} {
		if err := fixture.runs.Save(run); err != nil {
			t.Fatalf("save workflow run %q: %v", run.ID, err)
		}
	}

	response := stateMachineRunRouteRequest(
		t,
		fixture.handler,
		RouteGetStateMachineRun+"?shareSessionId=share-a",
		GetStateMachineRunRequest{
			ProjectConfigID: "project-alpha",
			MachineGroupID:  "workflow-a",
		},
		http.StatusOK,
	)

	var latest agentruns.Run
	if err := json.Unmarshal(response.Body.Bytes(), &latest); err != nil {
		t.Fatalf("decode share latest run: %v", err)
	}
	if latest.ID != "run-share-a" {
		t.Fatalf("expected share-a workflow run, got %#v", latest)
	}
	if fixture.shareSessions.touched["share-a"] != 1 {
		t.Fatalf("expected share-a session touch, got %#v", fixture.shareSessions.touched)
	}
}

func TestRegisterStateMachineRunRoutesFailClosedWhenSignalTargetProfileBlocksWorkflowSignalTool(t *testing.T) {
	t.Parallel()

	fixture := newSignalStateMachineRunRouteFixtureWithProfiles(t, config.ModeIDE, []agentprofiles.Profile{{
		ID:            "profile-no-signal",
		Name:          "No Signal Tool",
		ToolAllowlist: []string{"setta__search_ui_settings"},
	}})

	response := stateMachineRunRouteRequest(t, fixture.handler, RouteStartStateMachineRun, StartStateMachineRunRequest{
		ProjectConfigID: "project-alpha",
		MachineGroupID:  "workflow-signal",
	}, http.StatusBadRequest)
	stateMachineRouteErrorCode(t, response, "state_machine_run_invalid")
	if len(fixture.managedStarter.requests) != 0 {
		t.Fatalf("expected no managed chat dispatch before fail-closed validation, got %#v", fixture.managedStarter.requests)
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if !strings.Contains(payload.Error.Message, "profile-no-signal") || !strings.Contains(payload.Error.Message, "report_state_machine_signal") {
		t.Fatalf("expected signal-tool validation detail, got %#v", payload)
	}
}

func TestRegisterStateMachineRunRoutesRejectsScriptableHistoryOnReusedChatID(t *testing.T) {
	t.Parallel()

	project := stateMachineRunRouteSignalProject(t, nil)
	project.StateMachineEdges[0].TargetAction.ThreadStrategy = projectstate.StateMachineThreadStrategyContinueCurrentThread

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": project,
		},
	})
	if err != nil {
		t.Fatalf("open project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close project runtime: %v", err)
		}
	})

	root := t.TempDir()
	runs, err := agentruns.NewRunStore(root)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	managedService, engines, profiles, starter := newStateMachineRunRouteManagedService(t, projectRuntime, runs)

	if _, err := projectRuntime.SetChatSectionChatID(context.Background(), "project-alpha", "chat-section", stringPointer("chat-scriptable-history")); err != nil {
		t.Fatalf("seed chat section chat id: %v", err)
	}

	scriptableRun := agentruns.NewRun(nil, map[string]any{
		"runType":         "scriptable_chat",
		"chatId":          "chat-scriptable-history",
		"projectConfigId": "project-alpha",
		"engineConfigId":  "engine-scriptable",
		"messages":        []any{},
	}, time.Date(2026, 3, 14, 18, 59, 0, 0, time.UTC))
	scriptableRun.Status = agentruns.RunStatusCompleted
	finishedAt := time.Date(2026, 3, 14, 18, 59, 5, 0, time.UTC)
	scriptableRun.FinishedAt = &finishedAt
	scriptableRun.Outputs = map[string]any{
		"messages": []any{
			map[string]any{
				"id":   "assistant-scriptable",
				"role": "assistant",
				"content": []any{
					map[string]any{
						"type": "text",
						"text": "Scriptable reply",
					},
				},
			},
		},
	}
	if err := runs.Save(scriptableRun); err != nil {
		t.Fatalf("save scriptable run: %v", err)
	}

	runtime, err := statemachineruns.NewRuntime(statemachineruns.RuntimeOptions{
		Runs:     runs,
		Engines:  engines,
		Profiles: profiles,
		ResolveProjectRuntime: func(shareSessionID *string) (*projectstate.Runtime, error) {
			return projectRuntime, nil
		},
		ManagedChats: managedService,
		ManagedRuns:  &stateMachineRunRouteRunStopper{},
		TimeNow: func() time.Time {
			return time.Date(2026, 3, 14, 19, 0, 0, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatalf("new workflow runtime: %v", err)
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(config.ModeIDE), info: RuntimeInfo{Mode: string(config.ModeIDE)}},
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Register: func(r chi.Router) {
			if err := RegisterStateMachineRunRoutes(r, StateMachineRunRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeIDE),
				Runtime:    runtime,
			}); err != nil {
				t.Fatalf("register workflow routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	response := stateMachineRunRouteRequest(t, handler, RouteStartStateMachineRun, StartStateMachineRunRequest{
		ProjectConfigID: "project-alpha",
		MachineGroupID:  "workflow-signal",
		StartSectionID:  stringPointer("start-section"),
	}, http.StatusConflict)
	stateMachineRouteErrorCode(t, response, "chat_engine_mismatch")

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Message != managedchat.ErrChatEngineMismatch.Error() {
		t.Fatalf("expected chat engine mismatch detail, got %#v", payload)
	}
	if starter.lastInputs != nil {
		t.Fatalf("expected managed run starter not to be invoked, got %#v", starter.lastInputs)
	}
}

func TestRegisterStateMachineRunRoutesMapValidationAndNotFoundErrors(t *testing.T) {
	t.Parallel()

	fixture := newStateMachineRunRouteFixture(t, config.ModeIDE)

	for _, testCase := range []struct {
		name           string
		payload        StartStateMachineRunRequest
		expectedStatus int
		expectedCode   string
		messageSubstr  string
	}{
		{
			name:           "missing project config id",
			payload:        StartStateMachineRunRequest{MachineGroupID: "workflow-a"},
			expectedStatus: http.StatusBadRequest,
			expectedCode:   "project_config_id_required",
		},
		{
			name:           "missing machine group id",
			payload:        StartStateMachineRunRequest{ProjectConfigID: "project-alpha"},
			expectedStatus: http.StatusBadRequest,
			expectedCode:   "machine_group_id_required",
		},
		{
			name:           "missing project",
			payload:        StartStateMachineRunRequest{ProjectConfigID: "project-missing", MachineGroupID: "workflow-a"},
			expectedStatus: http.StatusNotFound,
			expectedCode:   "project_config_not_found",
		},
		{
			name: "missing start section",
			payload: StartStateMachineRunRequest{
				ProjectConfigID: "project-alpha",
				MachineGroupID:  "workflow-a",
				StartSectionID:  stringPointer("start-section-missing"),
			},
			expectedStatus: http.StatusNotFound,
			expectedCode:   "section_not_found",
		},
		{
			name:           "missing machine group start section",
			payload:        StartStateMachineRunRequest{ProjectConfigID: "project-alpha", MachineGroupID: "workflow-missing"},
			expectedStatus: http.StatusBadRequest,
			expectedCode:   "state_machine_run_invalid",
			messageSubstr:  "does not have a Start section",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			response := stateMachineRunRouteRequest(
				t,
				fixture.handler,
				RouteStartStateMachineRun,
				testCase.payload,
				testCase.expectedStatus,
			)
			stateMachineRouteErrorCode(t, response, testCase.expectedCode)
			if testCase.messageSubstr == "" {
				return
			}

			var payload errorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode error response: %v", err)
			}
			if !strings.Contains(payload.Error.Message, testCase.messageSubstr) {
				t.Fatalf("expected error detail containing %q, got %#v", testCase.messageSubstr, payload)
			}
		})
	}
}

func TestRegisterStateMachineRunRoutesBlocksMutationsInShareMode(t *testing.T) {
	t.Parallel()

	fixture := newStateMachineRunRouteFixture(t, config.ModeShare)

	for _, request := range []struct {
		route   string
		payload any
	}{
		{
			route: RouteStartStateMachineRun,
			payload: StartStateMachineRunRequest{
				ProjectConfigID: "project-alpha",
				MachineGroupID:  "workflow-a",
				StartSectionID:  stringPointer("start-section"),
			},
		},
		{
			route: RouteStopStateMachineRun,
			payload: StopStateMachineRunRequest{
				ProjectConfigID: "project-alpha",
				MachineGroupID:  "workflow-a",
			},
		},
		{
			route: RouteResetStateMachine,
			payload: ResetStateMachineRequest{
				ProjectConfigID: "project-alpha",
				MachineGroupID:  "workflow-a",
			},
		},
	} {
		response := stateMachineRunRouteRequest(t, fixture.handler, request.route, request.payload, http.StatusForbidden)
		stateMachineRouteErrorCode(t, response, "mode_forbidden")
	}
}

func TestRegisterStateMachineRunRoutesAllowsDeploymentRegistrationWithoutRuntime(t *testing.T) {
	t.Parallel()

	shareSessions := newTestHTTPShareSessionStore("share-a")
	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(config.ModeShare), info: RuntimeInfo{Mode: string(config.ModeShare)}},
		ModePolicy: modes.NewPolicy(config.ModeShare),
		Register: func(r chi.Router) {
			if err := RegisterStateMachineRunRoutes(r, StateMachineRunRouteDependencies{
				ModePolicy:    modes.NewPolicy(config.ModeShare),
				ShareSessions: shareSessions,
			}); err != nil {
				t.Fatalf("register workflow routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	response := stateMachineRunRouteRequest(
		t,
		handler,
		RouteGetStateMachineRun+"?shareSessionId=share-a",
		GetStateMachineRunRequest{
			ProjectConfigID: "project-alpha",
			MachineGroupID:  "workflow-a",
		},
		http.StatusNotFound,
	)
	stateMachineRouteErrorCode(t, response, "not_found")
}

type stateMachineRunRouteFixture struct {
	handler        http.Handler
	projectRuntime *projectstate.Runtime
	runs           *agentruns.RunStore
	managedStarter *stateMachineRunRouteManagedChatStarter
	managedStopper *stateMachineRunRouteRunStopper
	shareSessions  *testHTTPShareSessionStore
}

type stateMachineRunRouteManagedChatStarter struct {
	chatIDs  []string
	runIDs   []string
	requests []managedchat.StartChatRequest
	calls    int
	runs     *agentruns.RunStore
}

func (s *stateMachineRunRouteManagedChatStarter) StartChat(request managedchat.StartChatRequest) (managedchat.StartChatResult, error) {
	s.requests = append(s.requests, request)
	index := s.calls
	s.calls++
	run := agentruns.NewRun(nil, map[string]any{
		"runType":         managedchat.RunTypeManagedChat,
		"projectConfigId": request.ProjectConfigID,
		"sectionId":       request.SectionID,
		"engineConfigId":  request.EngineConfigID,
	}, time.Date(2026, 3, 14, 19, 0, 0, 0, time.UTC))
	run.ID = s.runIDs[index]
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
		ChatID: s.chatIDs[index],
		Run:    run,
	}, nil
}

type stateMachineRunRouteManagedRunStarter struct {
	lastInputs map[string]any
}

func (s *stateMachineRunRouteManagedRunStarter) Disabled() bool {
	return false
}

func (s *stateMachineRunRouteManagedRunStarter) StartRun(_ agentprofiles.Profile, inputs map[string]any) (agentruns.Run, error) {
	s.lastInputs = cloneRouteAnyMap(inputs)
	run := agentruns.NewRun(nil, inputs, time.Date(2026, 3, 14, 19, 0, 0, 0, time.UTC))
	run.Status = agentruns.RunStatusRunning
	return run, nil
}

type stateMachineRunRouteRunStopper struct {
	stopped []string
}

func (s *stateMachineRunRouteRunStopper) StopRun(runID string) (agentruns.Run, error) {
	s.stopped = append(s.stopped, runID)
	run := agentruns.NewRun(nil, map[string]any{}, time.Date(2026, 3, 14, 19, 0, 0, 0, time.UTC))
	run.ID = runID
	run.Status = agentruns.RunStatusCancelled
	return run, nil
}

func newStateMachineRunRouteFixture(t *testing.T, mode config.Mode) stateMachineRunRouteFixture {
	t.Helper()

	project := stateMachineRouteTestProject(t)
	project.SectionImpls["chat-impl"] = projectstate.SectionImpl{
		ID:   "chat-impl",
		Kind: projectstate.SectionKind("frontend"),
		Payload: mustMarshalProjectRouteObject(t, map[string]any{
			"id":             "chat-impl",
			"type":           "Chat",
			"engineConfigId": "engine-managed",
			"permissionMode": string(projectstate.ChatPermissionModeMinimal),
			"searchEnabled":  true,
		}),
	}

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": project,
		},
	})
	if err != nil {
		t.Fatalf("open project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close project runtime: %v", err)
		}
	})

	promptSectionID := "prompt-section"
	if _, err := projectRuntime.SetStateMachineEdges(context.Background(), "project-alpha", []projectstate.StateMachineEdge{
		{
			ID:              "edge-start-gate",
			MachineGroupID:  "workflow-a",
			SourceSectionID: "start-section",
			SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
			TargetSectionID: "gate-section",
			TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
		},
		{
			ID:              "edge-gate-chat",
			MachineGroupID:  "workflow-a",
			SourceSectionID: "gate-section",
			SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
			TargetSectionID: "chat-section",
			TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
			TargetAction: &projectstate.StateMachineTargetAction{
				Type:            projectstate.StateMachineTargetActionTypeSendPrompt,
				PromptSectionID: &promptSectionID,
				PromptInputs:    map[string]string{"name": "Ada"},
			},
		},
	}, nil); err != nil {
		t.Fatalf("seed workflow edges: %v", err)
	}

	root := t.TempDir()
	runs, err := agentruns.NewRunStore(root)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	engines, err := agentruns.NewEngineStore(root)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	if err := engines.Write([]agentruns.EngineConfig{{
		ID:         "engine-managed",
		Name:       "Managed Engine",
		EngineType: agentruns.EngineTypeSettaLLM,
	}}); err != nil {
		t.Fatalf("write engine configs: %v", err)
	}
	profiles := newStateMachineRunRouteAgentProfileStore(t, nil)

	managedStarter := &stateMachineRunRouteManagedChatStarter{
		chatIDs: []string{"chat-managed-1", "chat-managed-2"},
		runIDs:  []string{"child-run-1", "child-run-2"},
		runs:    runs,
	}
	managedStopper := &stateMachineRunRouteRunStopper{}
	baseTime := time.Date(2026, 3, 14, 19, 0, 0, 0, time.UTC)
	timeTick := 0
	runtime, err := statemachineruns.NewRuntime(statemachineruns.RuntimeOptions{
		Runs:     runs,
		Engines:  engines,
		Profiles: profiles,
		ResolveProjectRuntime: func(shareSessionID *string) (*projectstate.Runtime, error) {
			return projectRuntime, nil
		},
		ManagedChats: managedStarter,
		ManagedRuns:  managedStopper,
		TimeNow: func() time.Time {
			current := baseTime.Add(time.Duration(timeTick) * time.Second)
			timeTick++
			return current
		},
	})
	if err != nil {
		t.Fatalf("new workflow runtime: %v", err)
	}

	shareSessions := newTestHTTPShareSessionStore("share-a", "share-b")
	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterStateMachineRunRoutes(r, StateMachineRunRouteDependencies{
				ModePolicy:    modes.NewPolicy(mode),
				ShareSessions: shareSessions,
				Runtime:       runtime,
			}); err != nil {
				t.Fatalf("register workflow routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	return stateMachineRunRouteFixture{
		handler:        handler,
		projectRuntime: projectRuntime,
		runs:           runs,
		managedStarter: managedStarter,
		managedStopper: managedStopper,
		shareSessions:  shareSessions,
	}
}

func newSignalStateMachineRunRouteFixtureWithProfiles(
	t *testing.T,
	mode config.Mode,
	profiles []agentprofiles.Profile,
) stateMachineRunRouteFixture {
	t.Helper()

	var agentProfileID *string
	if len(profiles) > 0 {
		agentProfileID = stringPointer(profiles[0].ID)
	}

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": stateMachineRunRouteSignalProject(t, agentProfileID),
		},
	})
	if err != nil {
		t.Fatalf("open signal project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close signal project runtime: %v", err)
		}
	})

	root := t.TempDir()
	runs, err := agentruns.NewRunStore(root)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	engines, err := agentruns.NewEngineStore(root)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	if err := engines.Write([]agentruns.EngineConfig{{
		ID:         "engine-managed",
		Name:       "Managed Engine",
		EngineType: agentruns.EngineTypeSettaLLM,
	}}); err != nil {
		t.Fatalf("write engine configs: %v", err)
	}
	profileStore := newStateMachineRunRouteAgentProfileStore(t, profiles)

	managedStarter := &stateMachineRunRouteManagedChatStarter{
		chatIDs: []string{"chat-managed-1"},
		runIDs:  []string{"child-run-1"},
		runs:    runs,
	}
	managedStopper := &stateMachineRunRouteRunStopper{}
	runtime, err := statemachineruns.NewRuntime(statemachineruns.RuntimeOptions{
		Runs:     runs,
		Engines:  engines,
		Profiles: profileStore,
		ResolveProjectRuntime: func(shareSessionID *string) (*projectstate.Runtime, error) {
			return projectRuntime, nil
		},
		ManagedChats: managedStarter,
		ManagedRuns:  managedStopper,
		TimeNow: func() time.Time {
			return time.Date(2026, 3, 14, 19, 0, 0, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatalf("new signal workflow runtime: %v", err)
	}

	shareSessions := newTestHTTPShareSessionStore("share-a", "share-b")
	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterStateMachineRunRoutes(r, StateMachineRunRouteDependencies{
				ModePolicy:    modes.NewPolicy(mode),
				ShareSessions: shareSessions,
				Runtime:       runtime,
			}); err != nil {
				t.Fatalf("register signal workflow routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	return stateMachineRunRouteFixture{
		handler:        handler,
		projectRuntime: projectRuntime,
		runs:           runs,
		managedStarter: managedStarter,
		managedStopper: managedStopper,
		shareSessions:  shareSessions,
	}
}

func stateMachineRunRouteRequest(
	t *testing.T,
	handler http.Handler,
	route string,
	payload any,
	expectedStatus int,
) *httptest.ResponseRecorder {
	t.Helper()

	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal workflow route payload for %s: %v", route, err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api"+route, bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != expectedStatus {
		t.Fatalf("expected %d for %s, got %d with body %q", expectedStatus, route, response.Code, response.Body.String())
	}
	return response
}

func stateMachineRunOutputStringSlice(t *testing.T, run agentruns.Run, key string) []string {
	t.Helper()

	if run.Outputs == nil {
		t.Fatalf("expected outputs for key %s, got nil", key)
	}
	rawValues, ok := run.Outputs[key].([]any)
	if !ok {
		t.Fatalf("expected []any output for key %s, got %#v", key, run.Outputs[key])
	}
	result := make([]string, 0, len(rawValues))
	for _, rawValue := range rawValues {
		value, ok := rawValue.(string)
		if !ok {
			t.Fatalf("expected string output entry for key %s, got %#v", key, rawValue)
		}
		result = append(result, value)
	}
	return result
}

func stateMachineRunEventTypes(run agentruns.Run) []string {
	types := make([]string, 0, len(run.Events))
	for _, event := range run.Events {
		types = append(types, event.Type)
	}
	return types
}

func newStateMachineRouteTestRun(
	runID string,
	projectConfigID string,
	machineGroupID string,
	shareSessionID string,
	now time.Time,
) agentruns.Run {
	inputs := map[string]any{
		"runType":         statemachineruns.RunTypeStateMachine,
		"projectConfigId": projectConfigID,
		"machineGroupId":  machineGroupID,
	}
	if shareSessionID != "" {
		inputs["shareSessionId"] = shareSessionID
	}
	run := agentruns.NewRun(nil, inputs, now)
	run.ID = runID
	return run
}

func newStateMachineRunRouteManagedService(
	t *testing.T,
	projectRuntime *projectstate.Runtime,
	runs *agentruns.RunStore,
) (*managedchat.Service, *agentruns.EngineStore, *agentprofiles.Store, *stateMachineRunRouteManagedRunStarter) {
	t.Helper()

	root := t.TempDir()
	engines, err := agentruns.NewEngineStore(root)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	managedConfigID := "primary"
	if err := engines.Write([]agentruns.EngineConfig{{
		ID:               "engine-managed",
		Name:             "Managed Engine",
		EngineType:       agentruns.EngineTypeSettaLLM,
		SettaLLMConfigID: &managedConfigID,
	}}); err != nil {
		t.Fatalf("write engine configs: %v", err)
	}
	llmRuntime, err := llmconfig.NewRuntime(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			managedConfigID: {
				ID:        managedConfigID,
				Model:     "gpt-4o-mini",
				Provider:  "openai",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	})
	if err != nil {
		t.Fatalf("new llm runtime: %v", err)
	}
	profiles := newStateMachineRunRouteAgentProfileStore(t, nil)
	starter := &stateMachineRunRouteManagedRunStarter{}
	service, err := managedchat.NewService(managedchat.ServiceOptions{
		ProjectState: projectRuntime,
		Runs:         runs,
		Engines:      engines,
		LLM:          llmRuntime,
		Profiles:     profiles,
		Starter:      starter,
	})
	if err != nil {
		t.Fatalf("new managed chat service: %v", err)
	}
	return service, engines, profiles, starter
}

func newStateMachineRunRouteAgentProfileStore(t *testing.T, profiles []agentprofiles.Profile) *agentprofiles.Store {
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

func stateMachineRunRouteSignalProject(t *testing.T, agentProfileID *string) projectstate.Project {
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
			"chat-section":  {ID: "chat-section", Name: "Chat Section", VariantIDs: []string{"chat-variant"}, DefaultVariantID: "chat-variant"},
			"end-section":   {ID: "end-section", Name: "End Section", VariantIDs: []string{"end-variant"}, DefaultVariantID: "end-variant"},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"start-variant": {ID: "start-variant", ImplID: "start-impl"},
			"chat-variant":  {ID: "chat-variant", ImplID: "chat-impl"},
			"end-variant":   {ID: "end-variant", ImplID: "end-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"start-impl": {
				ID:   "start-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustMarshalProjectRouteObject(t, map[string]any{
					"id":             "start-impl",
					"type":           "StateMachineStart",
					"machineGroupId": "workflow-signal",
					"label":          "Start",
				}),
			},
			"chat-impl": {
				ID:   "chat-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustMarshalProjectRouteObject(t, map[string]any{
					"id":             "chat-impl",
					"type":           "Chat",
					"engineConfigId": "engine-managed",
					"agentProfileId": agentProfileID,
					"permissionMode": string(projectstate.ChatPermissionModeMinimal),
					"searchEnabled":  true,
				}),
			},
			"end-impl": {
				ID:   "end-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustMarshalProjectRouteObject(t, map[string]any{
					"id":             "end-impl",
					"type":           "StateMachineEnd",
					"machineGroupId": "workflow-signal",
					"label":          "Done",
				}),
			},
		},
		StateMachineEdges: []projectstate.StateMachineEdge{
			{
				ID:              "edge-start-chat",
				MachineGroupID:  "workflow-signal",
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
				MachineGroupID:  "workflow-signal",
				SourceSectionID: "chat-section",
				SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
				TargetSectionID: "end-section",
				TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
				SourceFilter: &projectstate.StateMachineSourceFilter{
					Type:       projectstate.StateMachineSourceFilterTypeSignal,
					SignalName: stringPointer("merge_decision"),
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize signal workflow project: %v", err)
	}
	return project
}
