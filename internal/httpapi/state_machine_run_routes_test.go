package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/agentruns"
	"setta/internal/config"
	"setta/internal/managedchat"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/statemachineruns"
)

func TestRegisterStateMachineRunRoutesStartGetStopAndResetInIDE(t *testing.T) {
	t.Parallel()

	fixture := newStateMachineRunRouteFixture(t, config.ModeIDE)

	startedResponse := stateMachineRunRouteRequest(t, fixture.handler, RouteStartStateMachineRun, StartStateMachineRunRequest{
		ProjectConfigID: "project-alpha",
		MachineGroupID:  "workflow-a",
		StartSectionID:  stringPointer("start-section"),
	}, http.StatusOK)

	var started agentruns.Run
	if err := json.Unmarshal(startedResponse.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode started run: %v", err)
	}
	if started.Status != agentruns.RunStatusRunning {
		t.Fatalf("expected running workflow run, got %#v", started)
	}
	if got := started.Inputs["runType"]; got != statemachineruns.RunTypeStateMachine {
		t.Fatalf("expected workflow run type, got %#v", started.Inputs)
	}

	latestResponse := stateMachineRunRouteRequest(t, fixture.handler, RouteGetStateMachineRun, GetStateMachineRunRequest{
		ProjectConfigID: "project-alpha",
		MachineGroupID:  "workflow-a",
	}, http.StatusOK)

	var latest agentruns.Run
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &latest); err != nil {
		t.Fatalf("decode latest run: %v", err)
	}
	if latest.ID != started.ID {
		t.Fatalf("expected latest run %q, got %#v", started.ID, latest)
	}

	stoppedResponse := stateMachineRunRouteRequest(t, fixture.handler, RouteStopStateMachineRun, StopStateMachineRunRequest{
		ProjectConfigID: "project-alpha",
		MachineGroupID:  "workflow-a",
	}, http.StatusOK)

	var stopped StateMachineRunControlResponse
	if err := json.Unmarshal(stoppedResponse.Body.Bytes(), &stopped); err != nil {
		t.Fatalf("decode stop response: %v", err)
	}
	if stopped.AlreadyStopped {
		t.Fatalf("expected running workflow to stop, got %#v", stopped)
	}
	if stopped.StoppedRunID == nil || *stopped.StoppedRunID != started.ID {
		t.Fatalf("expected stopped run id %q, got %#v", started.ID, stopped)
	}

	alreadyStoppedResponse := stateMachineRunRouteRequest(t, fixture.handler, RouteStopStateMachineRun, StopStateMachineRunRequest{
		ProjectConfigID: "project-alpha",
		MachineGroupID:  "workflow-a",
	}, http.StatusOK)
	var alreadyStopped StateMachineRunControlResponse
	if err := json.Unmarshal(alreadyStoppedResponse.Body.Bytes(), &alreadyStopped); err != nil {
		t.Fatalf("decode already-stopped response: %v", err)
	}
	if !alreadyStopped.AlreadyStopped || alreadyStopped.StoppedRunID != nil {
		t.Fatalf("expected alreadyStopped response, got %#v", alreadyStopped)
	}

	restartedResponse := stateMachineRunRouteRequest(t, fixture.handler, RouteStartStateMachineRun, StartStateMachineRunRequest{
		ProjectConfigID: "project-alpha",
		MachineGroupID:  "workflow-a",
	}, http.StatusOK)

	var restarted agentruns.Run
	if err := json.Unmarshal(restartedResponse.Body.Bytes(), &restarted); err != nil {
		t.Fatalf("decode restarted run: %v", err)
	}
	if restarted.ID == started.ID {
		t.Fatalf("expected a new workflow run after stop, got %#v", restarted)
	}

	resetResponse := stateMachineRunRouteRequest(t, fixture.handler, RouteResetStateMachine, ResetStateMachineRequest{
		ProjectConfigID: "project-alpha",
		MachineGroupID:  "workflow-a",
	}, http.StatusOK)

	var reset StateMachineRunControlResponse
	if err := json.Unmarshal(resetResponse.Body.Bytes(), &reset); err != nil {
		t.Fatalf("decode reset response: %v", err)
	}
	if reset.AlreadyStopped {
		t.Fatalf("expected reset to clear the active workflow run, got %#v", reset)
	}
	if reset.StoppedRunID == nil || *reset.StoppedRunID != restarted.ID {
		t.Fatalf("expected reset run id %q, got %#v", restarted.ID, reset)
	}

	missingResponse := stateMachineRunRouteRequest(t, fixture.handler, RouteGetStateMachineRun, GetStateMachineRunRequest{
		ProjectConfigID: "project-alpha",
		MachineGroupID:  "workflow-a",
	}, http.StatusNotFound)
	stateMachineRouteErrorCode(t, missingResponse, "state_machine_run_not_found")

	if len(fixture.managedStopper.stopped) != 2 {
		t.Fatalf("expected both workflow child runs to be cancelled, got %#v", fixture.managedStopper.stopped)
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

type stateMachineRunRouteFixture struct {
	handler        http.Handler
	projectRuntime *projectstate.Runtime
	runs           *agentruns.RunStore
	managedStopper *stateMachineRunRouteRunStopper
	shareSessions  *testHTTPShareSessionStore
}

type stateMachineRunRouteManagedChatStarter struct {
	chatIDs  []string
	runIDs   []string
	requests []managedchat.StartChatRequest
	calls    int
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
	return managedchat.StartChatResult{
		ChatID: s.chatIDs[index],
		Run:    run,
	}, nil
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

	managedStarter := &stateMachineRunRouteManagedChatStarter{
		chatIDs: []string{"chat-managed-1", "chat-managed-2"},
		runIDs:  []string{"child-run-1", "child-run-2"},
	}
	managedStopper := &stateMachineRunRouteRunStopper{}
	baseTime := time.Date(2026, 3, 14, 19, 0, 0, 0, time.UTC)
	timeTick := 0
	runtime, err := statemachineruns.NewRuntime(statemachineruns.RuntimeOptions{
		Runs:    runs,
		Engines: engines,
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
