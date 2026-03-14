package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/auth"
	"setta/internal/backendlogs"
	binarypayload "setta/internal/binary"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/observability"
	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/runs"
	"setta/internal/terminals"
)

func TestRegisterTerminalRoutesDeletesRequestedTerminalSessions(t *testing.T) {
	t.Parallel()
	skipIfTerminalPTYUnsupported(t)

	authService := newTestAuthService(t)
	terminalService := newHTTPTestTerminalService(t)
	openHTTPTestTerminal(t, terminalService, terminals.OpenOptions{
		ID:         terminals.BuildTerminalID("section-a", ""),
		ProjectID:  "project-a",
		AllowInput: true,
		Command:    quietHTTPTestCatCommand(t),
	})
	openHTTPTestTerminal(t, terminalService, terminals.OpenOptions{
		ID:         terminals.BuildTerminalID("section-b", ""),
		ProjectID:  "project-a",
		AllowInput: true,
		Command:    quietHTTPTestCatCommand(t),
	})

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Register: func(r chi.Router) {
			registerHTTPTestTerminalRoutes(t, r, modes.NewPolicy(config.ModeIDE), terminalService, newHTTPTestRunCodeService(t, terminalService))
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteDeleteTerminals, strings.NewReader(`{"sectionIds":["section-a"]}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if strings.TrimSpace(response.Body.String()) != "null" {
		t.Fatalf("expected null response payload, got %q", response.Body.String())
	}

	if _, ok := terminalService.Session(terminals.BuildTerminalID("section-a", "")); ok {
		t.Fatal("expected section-a terminal session to be deleted")
	}
	if _, ok := terminalService.Session(terminals.BuildTerminalID("section-b", "")); !ok {
		t.Fatal("expected section-b terminal session to remain")
	}
}

func TestRegisterTerminalRoutesIgnoresUnknownTerminalSections(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	terminalService := newHTTPTestTerminalService(t)

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Register: func(r chi.Router) {
			registerHTTPTestTerminalRoutes(t, r, modes.NewPolicy(config.ModeIDE), terminalService, newHTTPTestRunCodeService(t, terminalService))
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteDeleteTerminals, strings.NewReader(`{"sectionIds":["missing"]}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
}

func TestRegisterTerminalRoutesRejectsBlankSectionID(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	terminalService := newHTTPTestTerminalService(t)

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Register: func(r chi.Router) {
			registerHTTPTestTerminalRoutes(t, r, modes.NewPolicy(config.ModeIDE), terminalService, newHTTPTestRunCodeService(t, terminalService))
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteDeleteTerminals, strings.NewReader(`{"sectionIds":[""]}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"invalid_terminal_section"`) {
		t.Fatalf("expected invalid_terminal_section error, got %q", response.Body.String())
	}
}

func TestRegisterTerminalRoutesBlocksDeploymentMode(t *testing.T) {
	t.Parallel()

	terminalService := newHTTPTestTerminalService(t)
	policy := deployments.DefaultPolicy()
	policy.AllowRun = true
	runFixture := newHTTPTestDeploymentRunCodeFixture(t, terminalService, policy)
	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "share", info: RuntimeInfo{Mode: "share"}},
		ModePolicy: modes.NewPolicy(config.ModeShare),
		Register: func(r chi.Router) {
			registerHTTPTestDeploymentTerminalRoutes(t, r, modes.NewPolicy(config.ModeShare), terminalService, runFixture.service, runFixture.deployment)
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteDeleteTerminals, strings.NewReader(`{"sectionIds":["section-a"]}`))
	request.Header.Set("Content-Type", "application/json")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"missing_share_session"`) {
		t.Fatalf("expected missing_share_session error, got %q", response.Body.String())
	}
}

func TestRegisterTerminalRoutesDeletesDeploymentTerminalSessionsWhenPolicyAllows(t *testing.T) {
	t.Parallel()
	skipIfTerminalPTYUnsupported(t)

	terminalService := newHTTPTestTerminalService(t)
	policy := deployments.DefaultPolicy()
	policy.AllowRun = true
	runFixture := newHTTPTestDeploymentRunCodeFixture(t, terminalService, policy)
	if _, err := runFixture.deployment.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session share-a: %v", err)
	}
	if _, err := runFixture.deployment.CreateSessionWithID("share-b"); err != nil {
		t.Fatalf("create share session share-b: %v", err)
	}

	openHTTPTestTerminal(t, terminalService, terminals.OpenOptions{
		ID:             terminals.BuildTerminalID("section-a", "share-a"),
		ProjectID:      "project-a",
		ShareSessionID: "share-a",
		AllowInput:     false,
		Command:        quietHTTPTestCatCommand(t),
	})
	openHTTPTestTerminal(t, terminalService, terminals.OpenOptions{
		ID:             terminals.BuildTerminalID("section-b", "share-b"),
		ProjectID:      "project-a",
		ShareSessionID: "share-b",
		AllowInput:     false,
		Command:        quietHTTPTestCatCommand(t),
	})

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "share", info: RuntimeInfo{Mode: "share"}},
		ModePolicy: modes.NewPolicy(config.ModeShare),
		Register: func(r chi.Router) {
			registerHTTPTestDeploymentTerminalRoutes(t, r, modes.NewPolicy(config.ModeShare), terminalService, runFixture.service, runFixture.deployment)
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteDeleteTerminals, strings.NewReader(`{"sectionIds":["section-a"]}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(modes.ShareSessionHeaderName, "share-a")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if strings.TrimSpace(response.Body.String()) != "null" {
		t.Fatalf("expected null response payload, got %q", response.Body.String())
	}

	if _, ok := terminalService.Session(terminals.BuildTerminalID("section-a", "share-a")); ok {
		t.Fatal("expected share-a terminal session to be deleted")
	}
	if _, ok := terminalService.Session(terminals.BuildTerminalID("section-b", "share-b")); !ok {
		t.Fatal("expected share-b terminal session to remain")
	}
}

func TestRegisterTerminalRoutesRejectsDeploymentDeleteWhenPolicyDisallows(t *testing.T) {
	t.Parallel()
	skipIfTerminalPTYUnsupported(t)

	terminalService := newHTTPTestTerminalService(t)
	policy := deployments.DefaultPolicy()
	policy.AllowRun = false
	runFixture := newHTTPTestDeploymentRunCodeFixture(t, terminalService, policy)
	if _, err := runFixture.deployment.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}

	openHTTPTestTerminal(t, terminalService, terminals.OpenOptions{
		ID:             terminals.BuildTerminalID("section-a", "share-a"),
		ProjectID:      "project-a",
		ShareSessionID: "share-a",
		AllowInput:     false,
		Command:        quietHTTPTestCatCommand(t),
	})

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "share", info: RuntimeInfo{Mode: "share"}},
		ModePolicy: modes.NewPolicy(config.ModeShare),
		Register: func(r chi.Router) {
			registerHTTPTestDeploymentTerminalRoutes(t, r, modes.NewPolicy(config.ModeShare), terminalService, runFixture.service, runFixture.deployment)
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteDeleteTerminals, strings.NewReader(`{"sectionIds":["section-a"]}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(modes.ShareSessionHeaderName, "share-a")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"deployment_policy_denied"`) {
		t.Fatalf("expected deployment_policy_denied error, got %q", response.Body.String())
	}
	if _, ok := terminalService.Session(terminals.BuildTerminalID("section-a", "share-a")); !ok {
		t.Fatal("expected denied deployment delete to leave terminal session intact")
	}
}

func TestRegisterTerminalRoutesInterruptsOnlyMatchingProjectSessions(t *testing.T) {
	t.Parallel()
	skipIfTerminalPTYUnsupported(t)

	authService := newTestAuthService(t)
	terminalService := newHTTPTestTerminalService(t)
	scriptPath := writeHTTPInterruptibleScript(t)

	sessionA := terminals.BuildTerminalID("section-a", "")
	sessionB := terminals.BuildTerminalID("section-b", "")

	openHTTPTestTerminal(t, terminalService, terminals.OpenOptions{
		ID:         sessionA,
		ProjectID:  "project-a",
		AllowInput: true,
		Command:    interactiveHTTPTestBashCommand(t),
	})
	openHTTPTestTerminal(t, terminalService, terminals.OpenOptions{
		ID:         sessionB,
		ProjectID:  "project-b",
		AllowInput: true,
		Command:    interactiveHTTPTestBashCommand(t),
	})

	attachmentA := attachHTTPTestTerminal(t, terminalService, sessionA)
	attachmentB := attachHTTPTestTerminal(t, terminalService, sessionB)
	prepareHTTPInterruptShell(t, terminalService, sessionA, attachmentA)
	prepareHTTPInterruptShell(t, terminalService, sessionB, attachmentB)

	startHTTPInterruptibleForegroundJob(t, terminalService, sessionA, attachmentA, scriptPath)
	startHTTPInterruptibleForegroundJob(t, terminalService, sessionB, attachmentB, scriptPath)

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Register: func(r chi.Router) {
			registerHTTPTestTerminalRoutes(t, r, modes.NewPolicy(config.ModeIDE), terminalService, newHTTPTestRunCodeService(t, terminalService))
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteInterruptTerminalProcesses, strings.NewReader(`{"projectId":"project-a"}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload InterruptTerminalProcessesResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode interrupt response: %v", err)
	}
	if payload.InterruptedSessionCount != 1 {
		t.Fatalf("expected one interrupted session, got %#v", payload)
	}

	outputA := waitForHTTPTestOutputContains(t, attachmentA, "CHILD_EXIT:130")
	if !strings.Contains(outputA, "CHILD_INTERRUPTED") {
		t.Fatalf("expected project-a terminal to report interrupt, got %q", outputA)
	}

	ensureNoHTTPTestOutputContains(t, attachmentB, "CHILD_INTERRUPTED", 300*time.Millisecond)
}

func TestRegisterTerminalRoutesRejectsBlankInterruptProjectID(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	terminalService := newHTTPTestTerminalService(t)

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Register: func(r chi.Router) {
			registerHTTPTestTerminalRoutes(t, r, modes.NewPolicy(config.ModeIDE), terminalService, newHTTPTestRunCodeService(t, terminalService))
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteInterruptTerminalProcesses, strings.NewReader(`{"projectId":""}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"invalid_project_id"`) {
		t.Fatalf("expected invalid_project_id error, got %q", response.Body.String())
	}
}

func TestRegisterTerminalRoutesDoesNotRegisterLegacyKillSubprocessesRoute(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	terminalService := newHTTPTestTerminalService(t)

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Register: func(r chi.Router) {
			registerHTTPTestTerminalRoutes(t, r, modes.NewPolicy(config.ModeIDE), terminalService, newHTTPTestRunCodeService(t, terminalService))
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/killSubprocesses", strings.NewReader(`{"projectConfigId":"project-a"}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
}

func TestRegisterTerminalRoutesRejectsDeploymentInterruptWhenPolicyDisallows(t *testing.T) {
	t.Parallel()

	terminalService := newHTTPTestTerminalService(t)
	policy := deployments.DefaultPolicy()
	policy.AllowRun = false
	runFixture := newHTTPTestDeploymentRunCodeFixture(t, terminalService, policy)
	if _, err := runFixture.deployment.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}
	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "share", info: RuntimeInfo{Mode: "share"}},
		ModePolicy: modes.NewPolicy(config.ModeShare),
		Register: func(r chi.Router) {
			registerHTTPTestDeploymentTerminalRoutes(t, r, modes.NewPolicy(config.ModeShare), terminalService, runFixture.service, runFixture.deployment)
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteInterruptTerminalProcesses, strings.NewReader(`{"projectId":"project-a"}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(modes.ShareSessionHeaderName, "share-a")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"deployment_policy_denied"`) {
		t.Fatalf("expected deployment_policy_denied error, got %q", response.Body.String())
	}
}

func TestRegisterTerminalRoutesInterruptsDeploymentShareSessionsWhenPolicyAllows(t *testing.T) {
	t.Parallel()
	skipIfTerminalPTYUnsupported(t)

	terminalService := newHTTPTestTerminalService(t)
	policy := deployments.DefaultPolicy()
	policy.AllowRun = true
	runFixture := newHTTPTestDeploymentRunCodeFixture(t, terminalService, policy)
	if _, err := runFixture.deployment.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session share-a: %v", err)
	}
	if _, err := runFixture.deployment.CreateSessionWithID("share-b"); err != nil {
		t.Fatalf("create share session share-b: %v", err)
	}

	scriptPath := writeHTTPInterruptibleScript(t)
	sessionA := terminals.BuildTerminalID("section-a", "share-a")
	sessionB := terminals.BuildTerminalID("section-b", "share-b")

	openHTTPTestTerminal(t, terminalService, terminals.OpenOptions{
		ID:             sessionA,
		ProjectID:      "project-a",
		ShareSessionID: "share-a",
		AllowInput:     true,
		Command:        interactiveHTTPTestBashCommand(t),
	})
	openHTTPTestTerminal(t, terminalService, terminals.OpenOptions{
		ID:             sessionB,
		ProjectID:      "project-a",
		ShareSessionID: "share-b",
		AllowInput:     true,
		Command:        interactiveHTTPTestBashCommand(t),
	})

	attachmentA := attachHTTPTestTerminal(t, terminalService, sessionA)
	attachmentB := attachHTTPTestTerminal(t, terminalService, sessionB)
	prepareHTTPInterruptShell(t, terminalService, sessionA, attachmentA)
	prepareHTTPInterruptShell(t, terminalService, sessionB, attachmentB)
	startHTTPInterruptibleForegroundJob(t, terminalService, sessionA, attachmentA, scriptPath)
	startHTTPInterruptibleForegroundJob(t, terminalService, sessionB, attachmentB, scriptPath)

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "share", info: RuntimeInfo{Mode: "share"}},
		ModePolicy: modes.NewPolicy(config.ModeShare),
		Register: func(r chi.Router) {
			registerHTTPTestDeploymentTerminalRoutes(t, r, modes.NewPolicy(config.ModeShare), terminalService, runFixture.service, runFixture.deployment)
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteInterruptTerminalProcesses, strings.NewReader(`{"projectId":"project-a"}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(modes.ShareSessionHeaderName, "share-a")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload InterruptTerminalProcessesResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode deployment interrupt response: %v", err)
	}
	if payload.InterruptedSessionCount != 1 {
		t.Fatalf("expected one interrupted deployment session, got %#v", payload)
	}

	outputA := waitForHTTPTestOutputContains(t, attachmentA, "CHILD_EXIT:130")
	if !strings.Contains(outputA, "CHILD_INTERRUPTED") {
		t.Fatalf("expected share-a terminal to report interrupt, got %q", outputA)
	}
	ensureNoHTTPTestOutputContains(t, attachmentB, "CHILD_INTERRUPTED", 300*time.Millisecond)
}

func TestRegisterTerminalRoutesRunsCodeAndEnsuresAttachedTerminal(t *testing.T) {
	t.Parallel()
	skipIfTerminalPTYUnsupported(t)

	authService := newTestAuthService(t)
	terminalService := newHTTPTestTerminalService(t)
	runFixture := newHTTPTestRunCodeFixture(t, terminalService)

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Register: func(r chi.Router) {
			registerHTTPTestTerminalRoutes(t, r, modes.NewPolicy(config.ModeIDE), terminalService, runFixture.service)
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteRunCode, strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"code-section","runSnapshotMode":"never"}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if strings.TrimSpace(response.Body.String()) != "null" {
		t.Fatalf("expected null response payload, got %q", response.Body.String())
	}

	snapshot := runFixture.runtime.Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	_, _, impl, err := project.ResolveSection("code-section")
	if err != nil {
		t.Fatalf("resolve code section: %v", err)
	}
	if impl.Code == nil {
		t.Fatal("expected code impl")
	}
	attachedTerminalID := impl.Code.AttachedTerminalSectionID
	if attachedTerminalID == "" {
		t.Fatal("expected run route to ensure an attached terminal")
	}

	terminalID := terminals.BuildTerminalID(attachedTerminalID, "")
	attachment := attachHTTPTestTerminal(t, terminalService, terminalID)
	output := waitForHTTPTestOutputContains(t, attachment, "ROUTE_RUN_OK")
	if !strings.Contains(output, "ROUTE_RUN_OK") {
		t.Fatalf("expected run output in attached terminal, got %q", output)
	}
}

func TestRegisterTerminalRoutesReusesExplicitAttachedTerminal(t *testing.T) {
	t.Parallel()
	skipIfTerminalPTYUnsupported(t)

	authService := newTestAuthService(t)
	terminalService := newHTTPTestTerminalService(t)
	runFixture := newHTTPTestRunCodeFixture(t, terminalService)

	_, attachedTerminalID, err := runFixture.runtime.EnsureCodeSectionAttachedTerminal(
		"project-alpha",
		"code-section",
		projectstate.TerminalSectionSeed{
			SectionID: "explicit-terminal",
			VariantID: "explicit-terminal-variant",
			ImplID:    "explicit-terminal-impl",
			Name:      "Terminal",
		},
	)
	if err != nil {
		t.Fatalf("ensure attached terminal: %v", err)
	}

	terminalID := terminals.BuildTerminalID(attachedTerminalID, "")
	openHTTPTestTerminal(t, terminalService, terminals.OpenOptions{
		ID:         terminalID,
		ProjectID:  "project-alpha",
		AllowInput: true,
		Command:    interactiveHTTPTestBashCommand(t),
	})
	attachment := attachHTTPTestTerminal(t, terminalService, terminalID)
	prepareHTTPInterruptShell(t, terminalService, terminalID, attachment)

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Register: func(r chi.Router) {
			registerHTTPTestTerminalRoutes(t, r, modes.NewPolicy(config.ModeIDE), terminalService, runFixture.service)
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteRunCode, strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"code-section","terminalSectionId":"explicit-terminal","runSnapshotMode":"never"}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	output := waitForHTTPTestOutputContains(t, attachment, "ROUTE_RUN_OK")
	if !strings.Contains(output, "ROUTE_RUN_OK") {
		t.Fatalf("expected run output in explicit terminal, got %q", output)
	}
}

func TestRegisterTerminalRoutesRunsCodeWithSectionVariantOverridesWithoutMutatingBaseState(t *testing.T) {
	t.Parallel()
	skipIfTerminalPTYUnsupported(t)

	authService := newTestAuthService(t)
	terminalService := newHTTPTestTerminalService(t)
	runFixture := newHTTPTestRunCodeFixture(t, terminalService)

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Register: func(r chi.Router) {
			registerHTTPTestTerminalRoutes(t, r, modes.NewPolicy(config.ModeIDE), terminalService, runFixture.service)
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteRunCode, strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"code-section","runSnapshotMode":"never","sectionVariantOverrides":{"code-section":"code-bash-variant"}}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	snapshot := runFixture.runtime.Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	if got := project.SectionVariantMap["code-section"]; got != "code-python-variant" {
		t.Fatalf("expected active section variant to stay code-python-variant, got %q", got)
	}

	_, _, pythonImpl, err := project.ResolveSectionWithVariant("code-section", "code-python-variant")
	if err != nil {
		t.Fatalf("resolve python variant: %v", err)
	}
	if pythonImpl.Code == nil {
		t.Fatal("expected python code impl")
	}
	if pythonImpl.Code.AttachedTerminalSectionID != "" {
		t.Fatalf("did not expect python variant to gain an attached terminal, got %q", pythonImpl.Code.AttachedTerminalSectionID)
	}

	_, _, bashImpl, err := project.ResolveSectionWithVariant("code-section", "code-bash-variant")
	if err != nil {
		t.Fatalf("resolve bash variant: %v", err)
	}
	if bashImpl.Code == nil || bashImpl.Code.AttachedTerminalSectionID == "" {
		t.Fatal("expected bash override variant to gain an attached terminal")
	}

	terminalID := terminals.BuildTerminalID(bashImpl.Code.AttachedTerminalSectionID, "")
	attachment := attachHTTPTestTerminal(t, terminalService, terminalID)
	output := waitForHTTPTestOutputContains(t, attachment, "ROUTE_BASH_OK")
	if !strings.Contains(output, "ROUTE_BASH_OK") {
		t.Fatalf("expected bash override output in attached terminal, got %q", output)
	}
}

func TestRegisterTerminalRoutesReusesExplicitAttachedTerminalForSectionVariantOverride(t *testing.T) {
	t.Parallel()
	skipIfTerminalPTYUnsupported(t)

	authService := newTestAuthService(t)
	terminalService := newHTTPTestTerminalService(t)
	runFixture := newHTTPTestRunCodeFixture(t, terminalService)

	_, attachedTerminalID, err := runFixture.runtime.EnsureCodeSectionAttachedTerminalForVariant(
		"project-alpha",
		"code-section",
		"code-bash-variant",
		projectstate.TerminalSectionSeed{
			SectionID: "explicit-override-terminal",
			VariantID: "explicit-override-terminal-variant",
			ImplID:    "explicit-override-terminal-impl",
			Name:      "Terminal",
		},
	)
	if err != nil {
		t.Fatalf("ensure override attached terminal: %v", err)
	}

	terminalID := terminals.BuildTerminalID(attachedTerminalID, "")
	openHTTPTestTerminal(t, terminalService, terminals.OpenOptions{
		ID:         terminalID,
		ProjectID:  "project-alpha",
		AllowInput: true,
		Command:    interactiveHTTPTestBashCommand(t),
	})
	attachment := attachHTTPTestTerminal(t, terminalService, terminalID)
	prepareHTTPInterruptShell(t, terminalService, terminalID, attachment)

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Register: func(r chi.Router) {
			registerHTTPTestTerminalRoutes(t, r, modes.NewPolicy(config.ModeIDE), terminalService, runFixture.service)
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteRunCode, strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"code-section","terminalSectionId":"explicit-override-terminal","runSnapshotMode":"never","sectionVariantOverrides":{"code-section":"code-bash-variant"}}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	if _, _, _, err := runFixture.runtime.Snapshot().Document.Projects["project-alpha"].ResolveSection("terminal-seed-1"); err == nil {
		t.Fatal("did not expect override run to create a replacement terminal")
	}

	output := waitForHTTPTestOutputContains(t, attachment, "ROUTE_BASH_OK")
	if !strings.Contains(output, "ROUTE_BASH_OK") {
		t.Fatalf("expected bash override output in explicit terminal, got %q", output)
	}
}

func TestRegisterTerminalRoutesAppliesDrawSnapshotsBeforeRunningCode(t *testing.T) {
	t.Parallel()
	skipIfTerminalPTYUnsupported(t)

	authService := newTestAuthService(t)
	terminalService := newHTTPTestTerminalService(t)
	runFixture := newHTTPTestRunCodeFixture(t, terminalService)

	ref, err := runFixture.binaryStore.StoreBytes([]byte("snapshot-bytes"), "image/png", false)
	if err != nil {
		t.Fatalf("store binary payload: %v", err)
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Register: func(r chi.Router) {
			registerHTTPTestTerminalRoutes(t, r, modes.NewPolicy(config.ModeIDE), terminalService, runFixture.service)
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	requestBody, err := json.Marshal(RunCodeRequest{
		ProjectID:       "project-alpha",
		SectionID:       "code-section",
		RunSnapshotMode: runs.RunSnapshotModeNever,
		DrawSnapshotsBySectionID: map[string]binarypayload.ContentRef{
			"draw-section": ref,
		},
	})
	if err != nil {
		t.Fatalf("marshal run code request: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteRunCode, strings.NewReader(string(requestBody)))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	drawSnapshotPath, err := projectstate.BuildDrawSnapshotPath("draw-section", runFixture.artifactsRoot)
	if err != nil {
		t.Fatalf("build draw snapshot path: %v", err)
	}
	written, err := os.ReadFile(drawSnapshotPath)
	if err != nil {
		t.Fatalf("read draw snapshot path: %v", err)
	}
	if string(written) != "snapshot-bytes" {
		t.Fatalf("expected draw snapshot bytes, got %q", string(written))
	}

	snapshot := runFixture.runtime.Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	_, _, drawImpl, err := project.ResolveSection("draw-section")
	if err != nil {
		t.Fatalf("resolve draw section: %v", err)
	}
	if drawImpl.Draw == nil {
		t.Fatal("expected draw impl")
	}
	if drawImpl.Draw.RenderedImagePath != drawSnapshotPath {
		t.Fatalf("expected rendered image path %q, got %q", drawSnapshotPath, drawImpl.Draw.RenderedImagePath)
	}

	if _, err := runFixture.binaryStore.ReadBytes(ref.ContentID); !errors.Is(err, binarypayload.ErrPayloadNotFound) {
		t.Fatalf("expected binary payload to be deleted, got %v", err)
	}

	_, _, codeImpl, err := project.ResolveSection("code-section")
	if err != nil {
		t.Fatalf("resolve code section: %v", err)
	}
	if codeImpl.Code == nil || codeImpl.Code.AttachedTerminalSectionID == "" {
		t.Fatal("expected run route to ensure an attached terminal")
	}

	terminalID := terminals.BuildTerminalID(codeImpl.Code.AttachedTerminalSectionID, "")
	attachment := attachHTTPTestTerminal(t, terminalService, terminalID)
	output := waitForHTTPTestOutputContains(t, attachment, "ROUTE_RUN_OK")
	if !strings.Contains(output, "ROUTE_RUN_OK") {
		t.Fatalf("expected run output in attached terminal, got %q", output)
	}
}

func TestRegisterTerminalRoutesRunsGeneratedEntryCodeInTemporaryTerminal(t *testing.T) {
	t.Parallel()
	skipIfTerminalPTYUnsupported(t)

	authService := newTestAuthService(t)
	terminalService := newHTTPTestTerminalService(t)
	runFixture := newHTTPTestRunCodeFixture(t, terminalService)

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Register: func(r chi.Router) {
			registerHTTPTestTerminalRoutes(t, r, modes.NewPolicy(config.ModeIDE), terminalService, runFixture.service)
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteRunCode, strings.NewReader(`{"projectConfigId":"project-alpha","runSnapshotMode":"never"}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	snapshot := runFixture.runtime.Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	if _, _, _, err := project.ResolveSection("terminal-seed-1"); err != nil {
		t.Fatalf("expected generated-entry run to create a temporary terminal, got %v", err)
	}
	if !project.HasTopLevelSection("terminal-seed-1") {
		t.Fatal("expected generated-entry run terminal to be top-level")
	}

	terminalID := terminals.BuildTerminalID("terminal-seed-1", "")
	attachment := attachHTTPTestTerminal(t, terminalService, terminalID)
	output := waitForHTTPTestOutputContains(t, attachment, "ROUTE_GENERATED_OK")
	if !strings.Contains(output, "ROUTE_GENERATED_OK") {
		t.Fatalf("expected generated entry output in temporary terminal, got %q", output)
	}
}

func TestRegisterTerminalRoutesReusesIdleTopLevelTerminalForGeneratedEntry(t *testing.T) {
	t.Parallel()
	skipIfTerminalPTYUnsupported(t)

	authService := newTestAuthService(t)
	terminalService := newHTTPTestTerminalService(t)
	runFixture := newHTTPTestRunCodeFixture(t, terminalService)

	_, existingTerminalID, err := runFixture.runtime.CreateTemporaryTerminal(
		"project-alpha",
		projectstate.TerminalSectionSeed{
			SectionID: "existing-terminal",
			VariantID: "existing-terminal-variant",
			ImplID:    "existing-terminal-impl",
			Name:      "Terminal",
		},
	)
	if err != nil {
		t.Fatalf("create existing top-level terminal: %v", err)
	}

	openHTTPTestTerminal(t, terminalService, terminals.OpenOptions{
		ID:         terminals.BuildTerminalID(existingTerminalID, ""),
		ProjectID:  "project-alpha",
		AllowInput: true,
		Command:    interactiveHTTPTestBashCommand(t),
	})

	attachment := attachHTTPTestTerminal(t, terminalService, terminals.BuildTerminalID(existingTerminalID, ""))
	prepareHTTPInterruptShell(t, terminalService, terminals.BuildTerminalID(existingTerminalID, ""), attachment)

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Register: func(r chi.Router) {
			registerHTTPTestTerminalRoutes(t, r, modes.NewPolicy(config.ModeIDE), terminalService, runFixture.service)
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteRunCode, strings.NewReader(`{"projectConfigId":"project-alpha","runSnapshotMode":"never"}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	snapshot := runFixture.runtime.Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	if _, _, _, err := project.ResolveSection("terminal-seed-1"); err == nil {
		t.Fatal("did not expect generated-entry run to create a new temporary terminal")
	}

	output := waitForHTTPTestOutputOccurrences(t, attachment, "ROUTE_GENERATED_OK", 1)
	if !strings.Contains(output, "ROUTE_GENERATED_OK") {
		t.Fatalf("expected generated entry output in reused terminal, got %q", output)
	}
}

func TestRegisterTerminalRoutesRejectsUnsupportedRunCodePayloads(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	terminalService := newHTTPTestTerminalService(t)
	runFixture := newHTTPTestRunCodeFixture(t, terminalService)

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Register: func(r chi.Router) {
			registerHTTPTestTerminalRoutes(t, r, modes.NewPolicy(config.ModeIDE), terminalService, runFixture.service)
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	testCases := []struct {
		name         string
		payload      string
		expectedCode string
	}{
		{
			name:         "cli id",
			payload:      `{"projectConfigId":"project-alpha","sectionId":"code-section","cliId":"cli-1"}`,
			expectedCode: `"code":"unsupported_run_code_cli"`,
		},
		{
			name:         "bad section override",
			payload:      `{"projectConfigId":"project-alpha","sectionId":"code-section","sectionVariantOverrides":{"missing":"other"}}`,
			expectedCode: `"code":"invalid_run_code_request"`,
		},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/api"+RouteRunCode, strings.NewReader(testCase.payload))
			request.Header.Set("Content-Type", "application/json")
			addHTTPTestAuthCookie(t, request, authService)

			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
			}
			if !strings.Contains(response.Body.String(), testCase.expectedCode) {
				t.Fatalf("expected response to contain %s, got %q", testCase.expectedCode, response.Body.String())
			}
		})
	}
}

func TestRegisterTerminalRoutesAcceptsParamOverridesInIDE(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	terminalService := newHTTPTestTerminalService(t)
	runFixture := newHTTPTestRunCodeFixture(t, terminalService)

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		Register: func(r chi.Router) {
			registerHTTPTestTerminalRoutes(t, r, modes.NewPolicy(config.ModeIDE), terminalService, runFixture.service)
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteRunCode,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"code-section","paramOverrides":{"params-section:param-text":"2"}}`),
	)
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
}

func TestRegisterTerminalRoutesRejectsDeploymentRunWhenPolicyDisallows(t *testing.T) {
	t.Parallel()

	terminalService := newHTTPTestTerminalService(t)
	policy := deployments.DefaultPolicy()
	policy.AllowRun = false
	runFixture := newHTTPTestDeploymentRunCodeFixture(t, terminalService, policy)
	if _, err := runFixture.deployment.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "share", info: RuntimeInfo{Mode: "share"}},
		ModePolicy: modes.NewPolicy(config.ModeShare),
		Register: func(r chi.Router) {
			registerHTTPTestDeploymentTerminalRoutes(t, r, modes.NewPolicy(config.ModeShare), terminalService, runFixture.service, runFixture.deployment)
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteRunCode, strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"code-section"}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(modes.ShareSessionHeaderName, "share-a")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"deployment_policy_denied"`) {
		t.Fatalf("expected deployment policy denial, got %q", response.Body.String())
	}

	runCount, err := runFixture.deployment.SessionRunCount("share-a")
	if err != nil {
		t.Fatalf("session run count: %v", err)
	}
	if runCount != 0 {
		t.Fatalf("expected denied deployment run count 0, got %d", runCount)
	}
	if sessions := terminalService.List("project-alpha", "share-a"); len(sessions) != 0 {
		t.Fatalf("did not expect deployment terminal sessions, got %#v", sessions)
	}
}

func TestRegisterTerminalRoutesRejectsDeploymentParamOverridesWhenPolicyDisallows(t *testing.T) {
	t.Parallel()

	terminalService := newHTTPTestTerminalService(t)
	policy := deployments.DefaultPolicy()
	policy.AllowRun = true
	policy.AllowParamChanges = false
	runFixture := newHTTPTestDeploymentRunCodeFixture(t, terminalService, policy)
	if _, err := runFixture.deployment.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "share", info: RuntimeInfo{Mode: "share"}},
		ModePolicy: modes.NewPolicy(config.ModeShare),
		Register: func(r chi.Router) {
			registerHTTPTestDeploymentTerminalRoutes(t, r, modes.NewPolicy(config.ModeShare), terminalService, runFixture.service, runFixture.deployment)
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteRunCode,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"code-section","paramOverrides":{"params-section:param-text":"2"}}`),
	)
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{
		Name:  modes.ShareSessionCookieName,
		Value: "share-a",
	})

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"deployment_policy_denied"`) {
		t.Fatalf("expected deployment_policy_denied error, got %q", response.Body.String())
	}
}

func TestRegisterTerminalRoutesRejectsDeploymentCodeParamOverrides(t *testing.T) {
	t.Parallel()

	terminalService := newHTTPTestTerminalService(t)
	policy := deployments.DefaultPolicy()
	policy.AllowRun = true
	runFixture := newHTTPTestDeploymentRunCodeFixture(t, terminalService, policy)
	if _, err := runFixture.deployment.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "share", info: RuntimeInfo{Mode: "share"}},
		ModePolicy: modes.NewPolicy(config.ModeShare),
		Register: func(r chi.Router) {
			registerHTTPTestDeploymentTerminalRoutes(t, r, modes.NewPolicy(config.ModeShare), terminalService, runFixture.service, runFixture.deployment)
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteRunCode,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"code-section","paramOverrides":{"code-params-section:param-code":"print('updated')"}}`),
	)
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{
		Name:  modes.ShareSessionCookieName,
		Value: "share-a",
	})

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"deployment_policy_denied"`) {
		t.Fatalf("expected deployment_policy_denied error, got %q", response.Body.String())
	}
}

func TestRegisterTerminalRoutesRunsDeploymentCodeAgainstSessionOverlay(t *testing.T) {
	t.Parallel()
	skipIfTerminalPTYUnsupported(t)

	terminalService := newHTTPTestTerminalService(t)
	policy := deployments.DefaultPolicy()
	policy.AllowRun = true
	policy.RunSnapshotMode = deployments.RunSnapshotModeAlways
	runFixture := newHTTPTestDeploymentRunCodeFixture(t, terminalService, policy)
	if _, err := runFixture.deployment.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "share", info: RuntimeInfo{Mode: "share"}},
		ModePolicy: modes.NewPolicy(config.ModeShare),
		Register: func(r chi.Router) {
			registerHTTPTestDeploymentTerminalRoutes(t, r, modes.NewPolicy(config.ModeShare), terminalService, runFixture.service, runFixture.deployment)
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteRunCode, strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"code-section"}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(modes.ShareSessionHeaderName, "share-a")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	sessions := terminalService.List("project-alpha", "share-a")
	if len(sessions) != 1 {
		t.Fatalf("expected one deployment terminal session, got %#v", sessions)
	}
	if sessions[0].AllowInput {
		t.Fatal("did not expect deployment terminal input to be enabled")
	}

	attachment := attachHTTPTestTerminal(t, terminalService, sessions[0].ID)
	output := waitForHTTPTestOutputContains(t, attachment, "ROUTE_RUN_OK")
	if !strings.Contains(output, "ROUTE_RUN_OK") {
		t.Fatalf("expected deployment run output, got %q", output)
	}

	runCount, err := runFixture.deployment.SessionRunCount("share-a")
	if err != nil {
		t.Fatalf("session run count: %v", err)
	}
	if runCount != 1 {
		t.Fatalf("expected deployment run count 1, got %d", runCount)
	}

	sessionRunRoot, err := runFixture.deployment.Paths().SessionRunRoot("share-a")
	if err != nil {
		t.Fatalf("session run root: %v", err)
	}
	runEntries, err := os.ReadDir(sessionRunRoot)
	if err != nil {
		t.Fatalf("read session run root: %v", err)
	}
	runDirCount := 0
	foundRunSnapshot := false
	for _, entry := range runEntries {
		if !entry.IsDir() {
			continue
		}
		runDirCount++
		if _, err := os.Stat(filepath.Join(sessionRunRoot, entry.Name(), "run.py")); err == nil {
			foundRunSnapshot = true
		}
	}
	if runDirCount != 1 {
		t.Fatalf("expected one deployment run snapshot dir, got %d", runDirCount)
	}
	if !foundRunSnapshot {
		t.Fatal("expected deployment run snapshot to include run.py under share_runs/<session>")
	}

	baseProject := runFixture.deployment.Base().Snapshot().Document.Projects["project-alpha"]
	overlayRuntime, err := runFixture.deployment.Overlay("share-a")
	if err != nil {
		t.Fatalf("overlay runtime: %v", err)
	}
	overlayProject := overlayRuntime.Snapshot().Document.Projects["project-alpha"]
	if _, ok := baseProject.Sections["terminal-seed-1"]; ok {
		t.Fatalf("did not expect base project to gain attached terminal section: %#v", baseProject.Sections["terminal-seed-1"])
	}
	if len(overlayProject.Sections) <= len(baseProject.Sections) {
		t.Fatalf("expected overlay project to add an attached terminal section, got base=%d overlay=%d", len(baseProject.Sections), len(overlayProject.Sections))
	}
}

func TestRegisterTerminalRoutesRejectsDeploymentVariantOverridesWhenPolicyDisallows(t *testing.T) {
	t.Parallel()

	terminalService := newHTTPTestTerminalService(t)
	policy := deployments.DefaultPolicy()
	policy.AllowRun = true
	policy.AllowVariantChanges = false
	runFixture := newHTTPTestDeploymentRunCodeFixture(t, terminalService, policy)
	if _, err := runFixture.deployment.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "share", info: RuntimeInfo{Mode: "share"}},
		ModePolicy: modes.NewPolicy(config.ModeShare),
		Register: func(r chi.Router) {
			registerHTTPTestDeploymentTerminalRoutes(t, r, modes.NewPolicy(config.ModeShare), terminalService, runFixture.service, runFixture.deployment)
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteRunCode, strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"code-section","sectionVariantOverrides":{"code-section":"code-bash-variant"}}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(modes.ShareSessionHeaderName, "share-a")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"deployment_policy_denied"`) {
		t.Fatalf("expected deployment policy denial, got %q", response.Body.String())
	}
}

func TestRegisterTerminalRoutesRejectsSecondDeploymentRunWhenMultipleRunsDisabled(t *testing.T) {
	t.Parallel()
	skipIfTerminalPTYUnsupported(t)

	terminalService := newHTTPTestTerminalService(t)
	policy := deployments.DefaultPolicy()
	policy.AllowRun = true
	policy.AllowMultipleRuns = false
	runFixture := newHTTPTestDeploymentRunCodeFixture(t, terminalService, policy)
	if _, err := runFixture.deployment.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "share", info: RuntimeInfo{Mode: "share"}},
		ModePolicy: modes.NewPolicy(config.ModeShare),
		Register: func(r chi.Router) {
			registerHTTPTestDeploymentTerminalRoutes(t, r, modes.NewPolicy(config.ModeShare), terminalService, runFixture.service, runFixture.deployment)
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	for attempt := range 2 {
		request := httptest.NewRequest(http.MethodPost, "/api"+RouteRunCode, strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"code-section"}`))
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set(modes.ShareSessionHeaderName, "share-a")

		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)

		if attempt == 0 {
			if response.Code != http.StatusOK {
				t.Fatalf("expected first run 200, got %d with body %q", response.Code, response.Body.String())
			}
			continue
		}

		if response.Code != http.StatusForbidden {
			t.Fatalf("expected second run 403, got %d with body %q", response.Code, response.Body.String())
		}
		if !strings.Contains(response.Body.String(), `"code":"deployment_policy_denied"`) {
			t.Fatalf("expected deployment policy denial, got %q", response.Body.String())
		}
	}

	runCount, err := runFixture.deployment.SessionRunCount("share-a")
	if err != nil {
		t.Fatalf("session run count: %v", err)
	}
	if runCount != 1 {
		t.Fatalf("expected single-run deployment count 1, got %d", runCount)
	}
}

func TestRegisterTerminalRoutesRollsBackReservedDeploymentRunOnStartupFailure(t *testing.T) {
	t.Parallel()

	terminalService := newHTTPTestTerminalService(t)
	policy := deployments.DefaultPolicy()
	policy.AllowRun = true
	policy.AllowMultipleRuns = false
	runFixture := newHTTPTestDeploymentRunCodeFixture(t, terminalService, policy)
	if _, err := runFixture.deployment.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := terminalService.Close(shutdownCtx); err != nil {
		t.Fatalf("close terminal service: %v", err)
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "share", info: RuntimeInfo{Mode: "share"}},
		ModePolicy: modes.NewPolicy(config.ModeShare),
		Register: func(r chi.Router) {
			registerHTTPTestDeploymentTerminalRoutes(t, r, modes.NewPolicy(config.ModeShare), terminalService, runFixture.service, runFixture.deployment)
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteRunCode, strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"code-section"}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(modes.ShareSessionHeaderName, "share-a")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d with body %q", response.Code, response.Body.String())
	}

	runCount, err := runFixture.deployment.SessionRunCount("share-a")
	if err != nil {
		t.Fatalf("session run count: %v", err)
	}
	if runCount != 0 {
		t.Fatalf("expected reserved deployment run count rollback to 0, got %d", runCount)
	}
}

func newHTTPTestTerminalService(t *testing.T) *terminals.Service {
	t.Helper()

	service, err := terminals.New(terminals.Options{
		Logger: observability.NewLogger(0, io.Discard),
	})
	if err != nil {
		t.Fatalf("new terminal service: %v", err)
	}

	t.Cleanup(func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := service.Close(shutdownCtx); err != nil {
			t.Fatalf("close terminal service: %v", err)
		}
	})

	return service
}

func registerHTTPTestTerminalRoutes(t *testing.T, router chi.Router, modePolicy modes.Policy, terminalService *terminals.Service, runCodeService *runs.Service) {
	t.Helper()

	if modePolicy.IsDeployment() {
		t.Fatal("use registerHTTPTestDeploymentTerminalRoutes for deployment terminal route tests")
	}

	if err := RegisterTerminalRoutes(router, TerminalRouteDependencies{
		ModePolicy: modePolicy,
		Terminals:  terminalService,
		RunCode:    runCodeService,
	}); err != nil {
		t.Fatalf("register terminal routes: %v", err)
	}
}

func registerHTTPTestDeploymentTerminalRoutes(
	t *testing.T,
	router chi.Router,
	modePolicy modes.Policy,
	terminalService *terminals.Service,
	runCodeService *runs.Service,
	deployment *deployments.Runtime,
) {
	t.Helper()

	if err := RegisterTerminalRoutes(router, TerminalRouteDependencies{
		ModePolicy:    modePolicy,
		ShareSessions: deployment,
		Deployment:    deployment,
		Terminals:     terminalService,
		RunCode:       runCodeService,
	}); err != nil {
		t.Fatalf("register deployment terminal routes: %v", err)
	}
}

type httpTestRunCodeFixture struct {
	runtime       *projectstate.Runtime
	service       *runs.Service
	binaryStore   *binarypayload.Store
	artifactsRoot string
}

type httpTestDeploymentRunCodeFixture struct {
	deployment  *deployments.Runtime
	service     *runs.Service
	binaryStore *binarypayload.Store
}

func newHTTPTestRunCodeService(t *testing.T, terminalService *terminals.Service) *runs.Service {
	t.Helper()

	return newHTTPTestRunCodeFixture(t, terminalService).service
}

func newHTTPTestDeploymentRunCodeFixture(
	t *testing.T,
	terminalService *terminals.Service,
	policy deployments.Policy,
) httpTestDeploymentRunCodeFixture {
	t.Helper()

	root := t.TempDir()
	deploymentRoot := filepath.Join(root, "deployments", "demo-share", "v1")
	runtimeRoot := filepath.Join(root, "deployment_runtime", "demo-share", "v1")
	codeRoot := filepath.Join(deploymentRoot, "code")
	if err := os.MkdirAll(runtimeRoot, 0o755); err != nil {
		t.Fatalf("mkdir runtime root: %v", err)
	}
	if err := os.MkdirAll(codeRoot, 0o755); err != nil {
		t.Fatalf("mkdir code root: %v", err)
	}

	if err := os.WriteFile(filepath.Join(codeRoot, "run.py"), []byte("print('ROUTE_RUN_OK')\n"), 0o644); err != nil {
		t.Fatalf("write deployment run.py: %v", err)
	}
	if err := os.WriteFile(filepath.Join(codeRoot, "run.sh"), []byte("echo ROUTE_BASH_OK\n"), 0o644); err != nil {
		t.Fatalf("write deployment run.sh: %v", err)
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
					"code-params-section",
				},
				SectionVariantMap: map[string]string{
					"code-section":        "code-python-variant",
					"params-section":      "params-variant",
					"code-params-section": "code-params-variant",
				},
				Sections: map[string]projectstate.Section{
					"code-section": {
						ID:               "code-section",
						Name:             "Runner",
						VariantIDs:       []string{"code-python-variant", "code-bash-variant"},
						DefaultVariantID: "code-python-variant",
					},
					"params-section": {
						ID:               "params-section",
						Name:             "Params",
						VariantIDs:       []string{"params-variant"},
						DefaultVariantID: "params-variant",
					},
					"code-params-section": {
						ID:               "code-params-section",
						Name:             "Code Params",
						VariantIDs:       []string{"code-params-variant"},
						DefaultVariantID: "code-params-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"code-python-variant": {
						ID:     "code-python-variant",
						ImplID: "code-python-impl",
					},
					"code-bash-variant": {
						ID:     "code-bash-variant",
						ImplID: "code-bash-impl",
					},
					"params-variant": {
						ID:     "params-variant",
						ImplID: "params-impl",
					},
					"code-params-variant": {
						ID:     "code-params-variant",
						ImplID: "code-params-impl",
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
					"code-bash-impl": {
						ID:   "code-bash-impl",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguageBash,
							Binding: &projectstate.CodeFileBinding{
								Path:       "code/run.sh",
								AccessMode: projectstate.CodeFileAccessModeReadWrite,
							},
						},
					},
					"params-impl": {
						ID:      "params-impl",
						Kind:    projectstate.SectionKind("dict"),
						Payload: projectstate.RawJSON(`{"id":"params-impl","type":"Dict","codeObjVariantMap":{"param-text":"param-text-variant"}}`),
					},
					"code-params-impl": {
						ID:      "code-params-impl",
						Kind:    projectstate.SectionKind("dict"),
						Payload: projectstate.RawJSON(`{"id":"code-params-impl","type":"Dict","codeObjVariantMap":{"param-code":"param-code-variant"}}`),
					},
				},
				CodeObjs: map[string]projectstate.CodeObject{
					"param-text": {
						ID:               "param-text",
						Name:             "text_param",
						VariantIDs:       []string{"param-text-variant"},
						DefaultVariantID: "param-text-variant",
					},
					"param-code": {
						ID:               "param-code",
						Name:             "code_param",
						VariantIDs:       []string{"param-code-variant"},
						DefaultVariantID: "param-code-variant",
					},
				},
				CodeObjVariants: map[string]projectstate.CodeObjectVariant{
					"param-text-variant": {
						ID:     "param-text-variant",
						ImplID: "param-text-impl",
					},
					"param-code-variant": {
						ID:     "param-code-variant",
						ImplID: "param-code-impl",
					},
				},
				CodeObjImpls: map[string]projectstate.CodeObjectImpl{
					"param-text-impl": {
						ID:      "param-text-impl",
						Type:    "TextParam",
						Payload: projectstate.RawJSON(`{"id":"param-text-impl","type":"TextParam","value":"1"}`),
					},
					"param-code-impl": {
						ID:      "param-code-impl",
						Type:    "CodeParam",
						Payload: projectstate.RawJSON(`{"id":"param-code-impl","type":"CodeParam","value":"print('base')"}`),
					},
				},
			},
		},
	}

	writeHTTPTestProjectDocument(t, filepath.Join(deploymentRoot, projectstate.MainFileName), document)
	writeHTTPTestJSON(t, filepath.Join(deploymentRoot, "manifest.json"), map[string]any{
		"version":                1,
		"deploymentName":         "demo-share",
		"deploymentType":         "share",
		"defaultProjectConfigId": "project-alpha",
		"deploymentVersion":      "v1",
	})
	writeHTTPTestJSON(t, filepath.Join(deploymentRoot, "policy.json"), policy)

	deploymentRuntime, err := deployments.Open(context.Background(), deployments.RuntimeOptions{
		DeploymentRoot: deploymentRoot,
		RuntimeRoot:    runtimeRoot,
	})
	if err != nil {
		t.Fatalf("open deployment runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := deploymentRuntime.Close(); err != nil {
			t.Fatalf("close deployment runtime: %v", err)
		}
	})

	runPlanner, err := runs.NewPlanner(runs.PlannerOptions{
		ProjectState:   deploymentRuntime.Base(),
		SettaFilesRoot: deploymentRuntime.Paths().DeploymentRoot,
		RuntimeRoot:    deploymentRuntime.Paths().RuntimeRoot,
	})
	if err != nil {
		t.Fatalf("new deployment run planner: %v", err)
	}

	binaryStore, err := binarypayload.NewStoreForRuntimeRoot(runtimeRoot)
	if err != nil {
		t.Fatalf("new deployment binary store: %v", err)
	}

	runService, err := runs.NewService(runs.ServiceOptions{
		Planner:           runPlanner,
		ProjectState:      deploymentRuntime.Base(),
		DeploymentRuntime: deploymentRuntime,
		Terminals:         terminalService,
		BackendLogs:       mustNewHTTPTestBackendLogService(t),
		BinaryStore:       binaryStore,
		ArtifactsRoot:     deploymentRuntime.Paths().ArtifactsRoot,
		IDGenerator: func() string {
			return "seed-1"
		},
	})
	if err != nil {
		t.Fatalf("new deployment run service: %v", err)
	}

	return httpTestDeploymentRunCodeFixture{
		deployment:  deploymentRuntime,
		service:     runService,
		binaryStore: binaryStore,
	}
}

func newHTTPTestRunCodeFixture(t *testing.T, terminalService *terminals.Service) httpTestRunCodeFixture {
	t.Helper()

	root := t.TempDir()
	settaFilesRoot := filepath.Join(root, "setta_files")
	runtimeRoot := filepath.Join(settaFilesRoot, "runtime")
	artifactsRoot := filepath.Join(settaFilesRoot, "artifacts")
	codeRoot := filepath.Join(settaFilesRoot, "code")
	if err := os.MkdirAll(runtimeRoot, 0o755); err != nil {
		t.Fatalf("mkdir runtime root: %v", err)
	}
	if err := os.MkdirAll(codeRoot, 0o755); err != nil {
		t.Fatalf("mkdir code root: %v", err)
	}

	if err := os.WriteFile(filepath.Join(codeRoot, "run.py"), []byte("print('ROUTE_RUN_OK')\n"), 0o644); err != nil {
		t.Fatalf("write run.py: %v", err)
	}
	if err := os.WriteFile(filepath.Join(codeRoot, "run.sh"), []byte("echo ROUTE_BASH_OK\n"), 0o644); err != nil {
		t.Fatalf("write run.sh: %v", err)
	}
	if err := os.WriteFile(filepath.Join(codeRoot, "helper.py"), []byte("print('helper')\n"), 0o644); err != nil {
		t.Fatalf("write helper.py: %v", err)
	}
	if err := os.WriteFile(filepath.Join(codeRoot, "generated.py"), []byte("print('ROUTE_GENERATED_OK')\n"), 0o644); err != nil {
		t.Fatalf("write generated.py: %v", err)
	}
	if err := os.WriteFile(filepath.Join(codeRoot, "setta_gen_meta.py"), []byte("META = True\n"), 0o644); err != nil {
		t.Fatalf("write setta_gen_meta.py: %v", err)
	}

	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				CodegenTargets: []projectstate.ProjectCodegenTarget{
					{Language: string(projectstate.CodeLanguagePython)},
				},
				GeneratedCodeBinding: &projectstate.CodeFileBinding{
					Path:       "code/generated.py",
					AccessMode: projectstate.CodeFileAccessModeReadOnly,
				},
				GeneratedMetadataBinding: &projectstate.CodeFileBinding{
					Path:       "code/setta_gen_meta.py",
					AccessMode: projectstate.CodeFileAccessModeReadOnly,
				},
				EntryCodeBlockID: "code-section",
				TopLevelSectionIDs: []string{
					"code-section",
					"helper-section",
					"draw-section",
					"params-section",
					"gen-python-section",
					"code-params-section",
					"gen-plugin-section",
				},
				SectionVariantMap: map[string]string{
					"code-section":        "code-python-variant",
					"helper-section":      "helper-variant",
					"draw-section":        "draw-variant",
					"params-section":      "params-variant",
					"gen-python-section":  "gen-python-variant",
					"code-params-section": "code-params-variant",
					"gen-plugin-section":  "gen-plugin-variant",
				},
				Sections: map[string]projectstate.Section{
					"code-section": {
						ID:               "code-section",
						Name:             "Runner",
						VariantIDs:       []string{"code-python-variant", "code-bash-variant"},
						DefaultVariantID: "code-python-variant",
					},
					"helper-section": {
						ID:               "helper-section",
						Name:             "Helper",
						VariantIDs:       []string{"helper-variant"},
						DefaultVariantID: "helper-variant",
					},
					"draw-section": {
						ID:               "draw-section",
						Name:             "Canvas",
						VariantIDs:       []string{"draw-variant"},
						DefaultVariantID: "draw-variant",
					},
					"params-section": {
						ID:               "params-section",
						Name:             "Params",
						VariantIDs:       []string{"params-variant"},
						DefaultVariantID: "params-variant",
					},
					"gen-python-section": {
						ID:               "gen-python-section",
						Name:             "Generated Python",
						VariantIDs:       []string{"gen-python-variant"},
						DefaultVariantID: "gen-python-variant",
					},
					"code-params-section": {
						ID:               "code-params-section",
						Name:             "Code Params",
						VariantIDs:       []string{"code-params-variant"},
						DefaultVariantID: "code-params-variant",
					},
					"gen-plugin-section": {
						ID:               "gen-plugin-section",
						Name:             "Generated Plugin",
						VariantIDs:       []string{"gen-plugin-variant"},
						DefaultVariantID: "gen-plugin-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"code-python-variant": {
						ID:     "code-python-variant",
						ImplID: "code-python-impl",
					},
					"code-bash-variant": {
						ID:     "code-bash-variant",
						ImplID: "code-bash-impl",
					},
					"helper-variant": {
						ID:     "helper-variant",
						ImplID: "helper-impl",
					},
					"draw-variant": {
						ID:     "draw-variant",
						ImplID: "draw-impl",
					},
					"params-variant": {
						ID:     "params-variant",
						ImplID: "params-impl",
					},
					"gen-python-variant": {
						ID:     "gen-python-variant",
						ImplID: "gen-python-impl",
					},
					"code-params-variant": {
						ID:     "code-params-variant",
						ImplID: "code-params-impl",
					},
					"gen-plugin-variant": {
						ID:     "gen-plugin-variant",
						ImplID: "gen-plugin-impl",
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
					"code-bash-impl": {
						ID:   "code-bash-impl",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguageBash,
							Binding: &projectstate.CodeFileBinding{
								Path:       "code/run.sh",
								AccessMode: projectstate.CodeFileAccessModeReadWrite,
							},
						},
					},
					"helper-impl": {
						ID:   "helper-impl",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguagePython,
							Binding: &projectstate.CodeFileBinding{
								Path:       "code/helper.py",
								AccessMode: projectstate.CodeFileAccessModeReadWrite,
							},
						},
					},
					"draw-impl": {
						ID:   "draw-impl",
						Kind: projectstate.SectionKindDraw,
						Draw: &projectstate.DrawSectionImpl{},
					},
					"params-impl": {
						ID:      "params-impl",
						Kind:    projectstate.SectionKind("dict"),
						Payload: projectstate.RawJSON(`{"id":"params-impl","type":"Dict","codeObjVariantMap":{"param-text":"param-text-variant"}}`),
					},
					"gen-python-impl": {
						ID:   "gen-python-impl",
						Kind: projectstate.SectionKindGenerated,
						Generated: &projectstate.GeneratedSectionImpl{
							Kind: projectstate.GeneratedSectionKindPythonCode,
						},
					},
					"code-params-impl": {
						ID:      "code-params-impl",
						Kind:    projectstate.SectionKind("dict"),
						Payload: projectstate.RawJSON(`{"id":"code-params-impl","type":"Dict","codeObjVariantMap":{"param-code":"param-code-variant"}}`),
					},
					"gen-plugin-impl": {
						ID:   "gen-plugin-impl",
						Kind: projectstate.SectionKindGenerated,
						Generated: &projectstate.GeneratedSectionImpl{
							Kind: projectstate.GeneratedSectionKindPlugin,
						},
					},
				},
				CodeObjs: map[string]projectstate.CodeObject{
					"param-text": {
						ID:               "param-text",
						Name:             "text_param",
						VariantIDs:       []string{"param-text-variant"},
						DefaultVariantID: "param-text-variant",
					},
					"param-code": {
						ID:               "param-code",
						Name:             "code_param",
						VariantIDs:       []string{"param-code-variant"},
						DefaultVariantID: "param-code-variant",
					},
				},
				CodeObjVariants: map[string]projectstate.CodeObjectVariant{
					"param-text-variant": {
						ID:     "param-text-variant",
						ImplID: "param-text-impl",
					},
					"param-code-variant": {
						ID:     "param-code-variant",
						ImplID: "param-code-impl",
					},
				},
				CodeObjImpls: map[string]projectstate.CodeObjectImpl{
					"param-text-impl": {
						ID:      "param-text-impl",
						Type:    "TextParam",
						Payload: projectstate.RawJSON(`{"id":"param-text-impl","type":"TextParam","value":"1"}`),
					},
					"param-code-impl": {
						ID:      "param-code-impl",
						Type:    "CodeParam",
						Payload: projectstate.RawJSON(`{"id":"param-code-impl","type":"CodeParam","value":"print('base')"}`),
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

	runPlanner, err := runs.NewPlanner(runs.PlannerOptions{
		ProjectState:   projectRuntime,
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    runtimeRoot,
	})
	if err != nil {
		t.Fatalf("new planner: %v", err)
	}

	binaryStore, err := binarypayload.NewStoreForRuntimeRoot(runtimeRoot)
	if err != nil {
		t.Fatalf("new binary store: %v", err)
	}

	runService, err := runs.NewService(runs.ServiceOptions{
		Planner:       runPlanner,
		ProjectState:  projectRuntime,
		Terminals:     terminalService,
		BackendLogs:   mustNewHTTPTestBackendLogService(t),
		BinaryStore:   binaryStore,
		ArtifactsRoot: artifactsRoot,
		IDGenerator: func() string {
			return "seed-1"
		},
	})
	if err != nil {
		t.Fatalf("new run service: %v", err)
	}

	return httpTestRunCodeFixture{
		runtime:       projectRuntime,
		service:       runService,
		binaryStore:   binaryStore,
		artifactsRoot: artifactsRoot,
	}
}

func mustNewHTTPTestBackendLogService(t *testing.T) *backendlogs.Service {
	t.Helper()

	service, err := backendlogs.NewService(backendlogs.ServiceOptions{
		Logger:       observability.NewLogger(0, io.Discard),
		WebsocketHub: realtime.NewWebsocketHub(realtime.WebsocketHubOptions{}),
	})
	if err != nil {
		t.Fatalf("new backend log service: %v", err)
	}
	return service
}

func writeHTTPTestProjectDocument(t *testing.T, path string, document projectstate.Document) {
	t.Helper()

	normalized, err := document.Normalized()
	if err != nil {
		t.Fatalf("normalize http test project document: %v", err)
	}
	writeHTTPTestJSON(t, path, normalized)
}

func writeHTTPTestJSON(t *testing.T, path string, payload any) {
	t.Helper()

	encoded, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		t.Fatalf("marshal http test json: %v", err)
	}
	encoded = append(encoded, '\n')
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir http test json dir: %v", err)
	}
	if err := os.WriteFile(path, encoded, 0o644); err != nil {
		t.Fatalf("write http test json: %v", err)
	}
}

func openHTTPTestTerminal(t *testing.T, service *terminals.Service, options terminals.OpenOptions) {
	t.Helper()

	if _, created, err := service.Open(options); err != nil {
		t.Fatalf("open terminal %q: %v", options.ID, err)
	} else if !created {
		t.Fatalf("expected terminal %q to be created", options.ID)
	}
}

func attachHTTPTestTerminal(t *testing.T, service *terminals.Service, sessionID string) *terminals.Attachment {
	t.Helper()

	attachment, err := service.Attach(sessionID)
	if err != nil {
		t.Fatalf("attach terminal %q: %v", sessionID, err)
	}
	t.Cleanup(attachment.Close)
	return attachment
}

func addHTTPTestAuthCookie(t *testing.T, request *http.Request, authService *auth.Service) {
	t.Helper()

	token, _, err := authService.MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := authService.CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})
}

func quietHTTPTestCatCommand(t *testing.T) []string {
	t.Helper()

	shell := requireHTTPTestCommand(t, "sh")
	return []string{shell, "-c", "stty -echo; cat"}
}

func interactiveHTTPTestBashCommand(t *testing.T) []string {
	t.Helper()

	bash := requireHTTPTestCommand(t, "bash")
	return []string{bash, "--noprofile", "--norc", "-i"}
}

func requireHTTPTestCommand(t *testing.T, name string) string {
	t.Helper()

	path, err := exec.LookPath(name)
	if err != nil {
		t.Skipf("required command %q not available: %v", name, err)
	}
	return path
}

func prepareHTTPInterruptShell(t *testing.T, service *terminals.Service, sessionID string, attachment *terminals.Attachment) {
	t.Helper()

	if err := service.Write(sessionID, []byte("set -m\nstty -echo\nprintf 'READY\\n'\n")); err != nil {
		t.Fatalf("prepare interactive shell: %v", err)
	}
	output := waitForHTTPTestOutputContains(t, attachment, "READY")
	if !strings.Contains(output, "READY") {
		t.Fatalf("expected shell readiness output, got %q", output)
	}
}

func writeHTTPInterruptibleScript(t *testing.T) string {
	t.Helper()

	scriptPath := filepath.Join(t.TempDir(), "interruptible-child.sh")
	script := strings.Join([]string{
		"#!/bin/sh",
		"trap 'printf \"CHILD_INTERRUPTED\\n\"; exit 130' INT",
		"printf 'CHILD_RUNNING\\n'",
		"while :; do sleep 1; done",
		"",
	}, "\n")
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write interruptible script: %v", err)
	}
	return scriptPath
}

func startHTTPInterruptibleForegroundJob(t *testing.T, service *terminals.Service, sessionID string, attachment *terminals.Attachment, scriptPath string) {
	t.Helper()

	command := "sh " + shellSingleQuoteHTTP(scriptPath) + "; printf 'CHILD_EXIT:%s\\n' \"$?\"\n"
	if err := service.Write(sessionID, []byte(command)); err != nil {
		t.Fatalf("start foreground job: %v", err)
	}
	output := waitForHTTPTestOutputContains(t, attachment, "CHILD_RUNNING")
	if !strings.Contains(output, "CHILD_RUNNING") {
		t.Fatalf("expected child process to start, got %q", output)
	}
}

func waitForHTTPTestOutputContains(t *testing.T, attachment *terminals.Attachment, needle string) string {
	t.Helper()

	buffer := strings.Builder{}
	buffer.Write(attachment.History)
	if strings.Contains(buffer.String(), needle) {
		return buffer.String()
	}

	timeout := time.NewTimer(5 * time.Second)
	defer timeout.Stop()

	for {
		select {
		case chunk, ok := <-attachment.Output:
			if !ok {
				t.Fatalf("attachment output closed before %q appeared; collected output: %q", needle, buffer.String())
			}
			buffer.Write(chunk)
			if strings.Contains(buffer.String(), needle) {
				return buffer.String()
			}
		case <-timeout.C:
			t.Fatalf("timed out waiting for %q; collected output: %q", needle, buffer.String())
		}
	}
}

func waitForHTTPTestOutputOccurrences(t *testing.T, attachment *terminals.Attachment, needle string, count int) string {
	t.Helper()

	buffer := strings.Builder{}
	buffer.Write(attachment.History)
	if strings.Count(buffer.String(), needle) >= count {
		return buffer.String()
	}

	timeout := time.NewTimer(5 * time.Second)
	defer timeout.Stop()

	for {
		select {
		case chunk, ok := <-attachment.Output:
			if !ok {
				t.Fatalf("attachment output closed before %q appeared %d times; collected output: %q", needle, count, buffer.String())
			}
			buffer.Write(chunk)
			if strings.Count(buffer.String(), needle) >= count {
				return buffer.String()
			}
		case <-timeout.C:
			t.Fatalf("timed out waiting for %q %d times; collected output: %q", needle, count, buffer.String())
		}
	}
}

func ensureNoHTTPTestOutputContains(t *testing.T, attachment *terminals.Attachment, needle string, duration time.Duration) {
	t.Helper()

	timeout := time.NewTimer(duration)
	defer timeout.Stop()

	for {
		select {
		case chunk, ok := <-attachment.Output:
			if !ok {
				return
			}
			if strings.Contains(string(chunk), needle) {
				t.Fatalf("did not expect output %q, got chunk %q", needle, string(chunk))
			}
		case <-timeout.C:
			return
		}
	}
}

func shellSingleQuoteHTTP(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}

func skipIfTerminalPTYUnsupported(t *testing.T) {
	t.Helper()

	if runtime.GOOS == "windows" {
		t.Skip("PTY integration tests currently target macOS and Linux")
	}
}
