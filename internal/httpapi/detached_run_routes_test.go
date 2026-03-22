package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/detachedruns"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/pythonsdkcontracts"
	"setta/internal/runs"
)

func TestRegisterDetachedRunRoutesStartsAndTracksRun(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	fixture := newHTTPTestDetachedRunFixture(t, "print('detached-route')\n", "run-detached")
	handler := newHTTPTestDetachedRunHandler(t, authService, modes.NewPolicy(config.ModeIDE), fixture)

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteRunDetached, strings.NewReader(`{"projectConfigId":"project-alpha"}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var started RunDetachedResponse
	if err := json.Unmarshal(response.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode runDetached response: %v", err)
	}
	if started.RunID != fixture.runID {
		t.Fatalf("expected run id %q, got %#v", fixture.runID, started.RunID)
	}
	if started.Status != detachedruns.StatusRunning {
		t.Fatalf("expected running response status, got %#v", started.Status)
	}

	status := waitForHTTPDetachedRunStatus(t, fixture.manager, fixture.runID, func(run detachedruns.Run) bool {
		return run.Status != detachedruns.StatusRunning
	})
	if status.Status != detachedruns.StatusExited {
		t.Fatalf("expected exited status, got %#v", status)
	}
	if status.ExitCode == nil || *status.ExitCode != 0 {
		t.Fatalf("expected zero exit code, got %#v", status.ExitCode)
	}
	if !strings.Contains(status.SnapshotPath, string(filepath.Separator)+"runtime"+string(filepath.Separator)+"_") {
		t.Fatalf("expected runtime snapshot path, got %q", status.SnapshotPath)
	}
}

func TestRegisterDetachedRunRoutesStartsAndTracksExplicitEntrySectionAndValidParamOverride(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	fixture := newHTTPTestDetachedRunFixture(t, "print('detached-route')\n", "run-explicit-entry")
	handler := newHTTPTestDetachedRunHandler(t, authService, modes.NewPolicy(config.ModeIDE), fixture)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteRunDetached,
		strings.NewReader(`{"projectConfigId":"project-alpha","entrySectionId":"code-section","paramOverrides":{"params-section:param-text":"2"}}`),
	)
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var started RunDetachedResponse
	if err := json.Unmarshal(response.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode runDetached response: %v", err)
	}
	if started.RunID != fixture.runID {
		t.Fatalf("expected run id %q, got %#v", fixture.runID, started.RunID)
	}

	status := waitForHTTPDetachedRunStatus(t, fixture.manager, fixture.runID, func(run detachedruns.Run) bool {
		return run.Status != detachedruns.StatusRunning
	})
	if status.Status != detachedruns.StatusExited {
		t.Fatalf("expected exited status, got %#v", status)
	}
	if status.EntrySectionID == nil || *status.EntrySectionID != "code-section" {
		t.Fatalf("expected entry section id code-section, got %#v", status.EntrySectionID)
	}
}

func TestRegisterDetachedRunRoutesCancelsRun(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	fixture := newHTTPTestDetachedRunFixture(t, "import time; time.sleep(10)\n", "run-cancel")
	handler := newHTTPTestDetachedRunHandler(t, authService, modes.NewPolicy(config.ModeIDE), fixture)

	startRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteRunDetached, strings.NewReader(`{"projectConfigId":"project-alpha"}`))
	startRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, startRequest, authService)
	startResponse := httptest.NewRecorder()
	handler.ServeHTTP(startResponse, startRequest)
	if startResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", startResponse.Code, startResponse.Body.String())
	}

	cancelRequest := httptest.NewRequest(http.MethodPost, "/api"+RouteCancelRun, strings.NewReader(`{"runId":"run-cancel"}`))
	cancelRequest.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, cancelRequest, authService)
	cancelResponse := httptest.NewRecorder()
	handler.ServeHTTP(cancelResponse, cancelRequest)
	if cancelResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", cancelResponse.Code, cancelResponse.Body.String())
	}

	status := waitForHTTPDetachedRunStatus(t, fixture.manager, fixture.runID, func(run detachedruns.Run) bool {
		return run.Status == detachedruns.StatusCanceled && run.ExitCode != nil
	})
	if status.Status != detachedruns.StatusCanceled {
		t.Fatalf("expected canceled status, got %#v", status)
	}
}

func TestRegisterDetachedRunRoutesRejectsNeverSnapshotMode(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	fixture := newHTTPTestDetachedRunFixture(t, "print('detached-route')\n", "run-never")
	handler := newHTTPTestDetachedRunHandler(t, authService, modes.NewPolicy(config.ModeIDE), fixture)

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteRunDetached, strings.NewReader(`{"projectConfigId":"project-alpha","runSnapshotMode":"never"}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"detail":"Detached runs always snapshot; runSnapshotMode=never is not supported."`) {
		t.Fatalf("expected never-snapshot detail, got %q", response.Body.String())
	}
}

func TestRegisterDetachedRunRoutesRejectsDeploymentMode(t *testing.T) {
	t.Parallel()

	fixture := newHTTPTestDetachedRunFixture(t, "print('detached-route')\n", "run-share")
	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "share", info: RuntimeInfo{Mode: "share"}},
		ModePolicy: modes.NewPolicy(config.ModeShare),
		Register: func(r chi.Router) {
			if err := RegisterDetachedRunRoutes(r, DetachedRunRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeShare),
				Planner:    fixture.planner,
				Runs:       fixture.manager,
			}); err != nil {
				t.Fatalf("register detached run routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteRunDetached, strings.NewReader(`{"projectConfigId":"project-alpha"}`))
	request.Header.Set("Content-Type", "application/json")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"detail":"Detached runs are not supported in deployment mode."`) {
		t.Fatalf("expected deployment detail, got %q", response.Body.String())
	}
}

func TestRegisterDetachedRunRoutesRejectsLauncherMode(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	fixture := newHTTPTestDetachedRunFixture(t, "print('detached-route')\n", "run-launcher")
	handler := newHTTPTestDetachedRunHandler(t, authService, modes.NewPolicy(config.ModeLauncher), fixture)

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteRunDetached, strings.NewReader(`{"projectConfigId":"project-alpha"}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"detail":"Launcher mode does not allow this endpoint."`) {
		t.Fatalf("expected launcher detail, got %q", response.Body.String())
	}
}

func TestRegisterDetachedRunRoutesUnknownRunUsesGenericInternalError(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	fixture := newHTTPTestDetachedRunFixture(t, "print('detached-route')\n", "run-missing")
	handler := newHTTPTestDetachedRunHandler(t, authService, modes.NewPolicy(config.ModeIDE), fixture)

	for _, routePath := range []string{RouteGetRunStatus, RouteCancelRun} {
		request := httptest.NewRequest(http.MethodPost, "/api"+routePath, strings.NewReader(`{"runId":"missing"}`))
		request.Header.Set("Content-Type", "application/json")
		addHTTPTestAuthCookie(t, request, authService)

		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusInternalServerError {
			t.Fatalf("expected 500 for %s, got %d with body %q", routePath, response.Code, response.Body.String())
		}
		if !strings.Contains(response.Body.String(), `"code":"internal_error"`) {
			t.Fatalf("expected internal_error for %s, got %q", routePath, response.Body.String())
		}
	}
}

func TestRegisterDetachedRunRoutesRejectsInvalidParamOverrideKey(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	fixture := newHTTPTestDetachedRunFixture(t, "print('detached-route')\n", "run-bad-param")
	handler := newHTTPTestDetachedRunHandler(t, authService, modes.NewPolicy(config.ModeIDE), fixture)

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteRunDetached, strings.NewReader(`{"projectConfigId":"project-alpha","paramOverrides":{"bad":"2"}}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"detail":"Invalid param override key: 'bad'"`) {
		t.Fatalf("expected invalid param override detail, got %q", response.Body.String())
	}
}

func TestRegisterDetachedRunRoutesReturnsRunnerSummarySnapshot(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	fixture := newHTTPTestDetachedRunFixture(t, "print('detached-route')\n", "run-summary")
	handler := newHTTPTestDetachedRunHandler(t, authService, modes.NewPolicy(config.ModeIDE), fixture)

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetRunnerSummary, strings.NewReader(`{"projectConfigId":"project-alpha"}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload pythonsdkcontracts.RunnerSummarySnapshot
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode runner summary snapshot: %v", err)
	}
	if payload.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected project-alpha, got %#v", payload.ProjectConfigID)
	}
	if len(payload.Sections) != 2 {
		t.Fatalf("expected two sections, got %#v", payload.Sections)
	}
	if payload.Sections[0].Name != "Runner" || payload.Sections[1].Name != "Globals" {
		t.Fatalf("unexpected section ordering %#v", payload.Sections)
	}
	if len(payload.Sections[1].Params) != 1 || payload.Sections[1].Params[0].Name != "text_param" {
		t.Fatalf("expected Globals param summary, got %#v", payload.Sections[1].Params)
	}
}

type httpTestDetachedRunFixture struct {
	manager      *detachedruns.Manager
	planner      *runs.Planner
	projectState *projectstate.Runtime
	runID        string
}

func newHTTPTestDetachedRunHandler(
	t *testing.T,
	authService *auth.Service,
	modePolicy modes.Policy,
	fixture httpTestDetachedRunFixture,
) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(modePolicy.Mode()), info: RuntimeInfo{Mode: string(modePolicy.Mode())}},
		Auth:       authService,
		ModePolicy: modePolicy,
		Register: func(r chi.Router) {
			if err := RegisterDetachedRunRoutes(r, DetachedRunRouteDependencies{
				ModePolicy:   modePolicy,
				Planner:      fixture.planner,
				Runs:         fixture.manager,
				ProjectState: fixture.projectState,
			}); err != nil {
				t.Fatalf("register detached run routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	return handler
}

func newHTTPTestDetachedRunFixture(t *testing.T, script string, runID string) httpTestDetachedRunFixture {
	t.Helper()

	workspaceRoot := t.TempDir()
	settaFilesRoot := filepath.Join(workspaceRoot, "setta_files")
	runtimeRoot := filepath.Join(settaFilesRoot, "runtime")
	codeRoot := filepath.Join(settaFilesRoot, "code")
	if err := os.MkdirAll(runtimeRoot, 0o755); err != nil {
		t.Fatalf("mkdir runtime root: %v", err)
	}
	if err := os.MkdirAll(codeRoot, 0o755); err != nil {
		t.Fatalf("mkdir code root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(codeRoot, "run.py"), []byte(script), 0o644); err != nil {
		t.Fatalf("write python file: %v", err)
	}

	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:               "project-alpha",
				Name:             "Alpha",
				EntryCodeBlockID: "code-section",
				TopLevelSectionIDs: []string{
					"code-section",
					"params-section",
				},
				SectionVariantMap: map[string]string{
					"code-section":   "code-python-variant",
					"params-section": "params-variant",
				},
				Sections: map[string]projectstate.Section{
					"code-section": {
						ID:               "code-section",
						Name:             "Runner",
						VariantIDs:       []string{"code-python-variant"},
						DefaultVariantID: "code-python-variant",
					},
					"params-section": {
						ID:               "params-section",
						Name:             "Globals",
						VariantIDs:       []string{"params-variant"},
						DefaultVariantID: "params-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"code-python-variant": {
						ID:     "code-python-variant",
						ImplID: "code-python-impl",
					},
					"params-variant": {
						ID:     "params-variant",
						ImplID: "params-impl",
					},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"code-python-impl": {
						ID:   "code-python-impl",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguagePython,
							Binding: &projectstate.CodeFileBinding{
								Path:       "code/run.py",
								AccessMode: projectstate.CodeFileAccessModeReadWrite,
							},
						},
					},
					"params-impl": {
						ID:      "params-impl",
						Kind:    projectstate.SectionKind("dict"),
						Payload: projectstate.RawJSON(`{"id":"params-impl","type":"Dict","codeObjVariantMap":{"param-text":"param-text-variant"}}`),
					},
				},
				CodeObjs: map[string]projectstate.CodeObject{
					"param-text": {
						ID:               "param-text",
						Name:             "text_param",
						VariantIDs:       []string{"param-text-variant"},
						DefaultVariantID: "param-text-variant",
					},
				},
				CodeObjVariants: map[string]projectstate.CodeObjectVariant{
					"param-text-variant": {
						ID:     "param-text-variant",
						ImplID: "param-text-impl",
					},
				},
				CodeObjImpls: map[string]projectstate.CodeObjectImpl{
					"param-text-impl": {
						ID:      "param-text-impl",
						Type:    "TextParam",
						Payload: projectstate.RawJSON(`{"id":"param-text-impl","type":"TextParam","value":"1"}`),
					},
				},
			},
		},
	}

	projectRuntime, err := projectstate.OpenOverlayRuntime(document)
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		_ = projectRuntime.Close()
	})

	planner, err := runs.NewPlanner(runs.PlannerOptions{
		ProjectState:   projectRuntime,
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    runtimeRoot,
	})
	if err != nil {
		t.Fatalf("new planner: %v", err)
	}

	manager, err := detachedruns.NewManager(detachedruns.ManagerOptions{
		RuntimeRoot: runtimeRoot,
		NewRunID: func() string {
			return runID
		},
	})
	if err != nil {
		t.Fatalf("new detached run manager: %v", err)
	}

	return httpTestDetachedRunFixture{
		manager:      manager,
		planner:      planner,
		projectState: projectRuntime,
		runID:        runID,
	}
}

func waitForHTTPDetachedRunStatus(
	t *testing.T,
	manager *detachedruns.Manager,
	runID string,
	done func(detachedruns.Run) bool,
) detachedruns.Run {
	t.Helper()

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		run, err := manager.GetStatus(runID)
		if err != nil {
			t.Fatalf("get detached run status: %v", err)
		}
		if done(run) {
			return run
		}
		time.Sleep(50 * time.Millisecond)
	}

	run, err := manager.GetStatus(runID)
	if err != nil {
		t.Fatalf("get detached run status after timeout: %v", err)
	}
	t.Fatalf("timed out waiting for detached run state, last status %#v", run)
	return detachedruns.Run{}
}
