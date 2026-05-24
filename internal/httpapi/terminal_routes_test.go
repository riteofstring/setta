package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	binarypayload "setta/internal/binary"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/terminals"

	"github.com/go-chi/chi/v5"
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

	outputA := waitForHTTPTestOutputContains(t, terminalService, sessionA, attachmentA, "CHILD_EXIT:130")
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

	outputA := waitForHTTPTestOutputContains(t, terminalService, sessionA, attachmentA, "CHILD_EXIT:130")
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
	output := waitForHTTPTestOutputContains(t, terminalService, terminalID, attachment, "ROUTE_RUN_OK")
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

	output := waitForHTTPTestOutputContains(t, terminalService, terminalID, attachment, "ROUTE_RUN_OK")
	if !strings.Contains(output, "ROUTE_RUN_OK") {
		t.Fatalf("expected run output in explicit terminal, got %q", output)
	}
}

func TestRegisterTerminalRoutesIgnoresInvalidExplicitTerminalAndFallsBackToAttachedTerminal(t *testing.T) {
	t.Parallel()
	skipIfTerminalPTYUnsupported(t)

	authService := newTestAuthService(t)
	terminalService := newHTTPTestTerminalService(t)
	runFixture := newHTTPTestRunCodeFixture(t, terminalService)

	_, attachedTerminalID, err := runFixture.runtime.EnsureCodeSectionAttachedTerminal(
		"project-alpha",
		"code-section",
		projectstate.TerminalSectionSeed{
			SectionID: "attached-terminal",
			VariantID: "attached-terminal-variant",
			ImplID:    "attached-terminal-impl",
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

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteRunCode, strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"code-section","terminalSectionId":"invalid-terminal","runSnapshotMode":"never"}`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
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
	if impl.Code.AttachedTerminalSectionID != attachedTerminalID {
		t.Fatalf("expected invalid explicit terminal id to fall back to attached terminal %q, got %q", attachedTerminalID, impl.Code.AttachedTerminalSectionID)
	}
	if _, exists := project.Sections["invalid-terminal"]; exists {
		t.Fatalf("did not expect invalid explicit terminal id to create a terminal section, got %#v", project.Sections["invalid-terminal"])
	}

	output := waitForHTTPTestOutputContains(t, terminalService, terminalID, attachment, "ROUTE_RUN_OK")
	if !strings.Contains(output, "ROUTE_RUN_OK") {
		t.Fatalf("expected run output in fallback attached terminal, got %q", output)
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
	output := waitForHTTPTestOutputContains(t, terminalService, terminalID, attachment, "ROUTE_BASH_OK")
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

	output := waitForHTTPTestOutputContains(t, terminalService, terminalID, attachment, "ROUTE_BASH_OK")
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
		RunSnapshotMode: deployments.RunSnapshotModeNever,
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
	output := waitForHTTPTestOutputContains(t, terminalService, terminalID, attachment, "ROUTE_RUN_OK")
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
	terminalVariantID := project.SectionVariantMap["terminal-seed-1"]
	if terminalVariantID == "" {
		t.Fatal("expected generated-entry run terminal to have a variant mapping")
	}
	terminalImplID := project.SectionVariants[terminalVariantID].ImplID
	if terminalImplID == "" {
		t.Fatal("expected generated-entry run terminal to have an impl id")
	}
	var terminalPayload struct {
		Size struct {
			Width  float64 `json:"width"`
			Height float64 `json:"height"`
		} `json:"size"`
	}
	if err := json.Unmarshal(project.SectionImpls[terminalImplID].Payload, &terminalPayload); err != nil {
		t.Fatalf("decode generated-entry terminal payload: %v", err)
	}
	if terminalPayload.Size.Width != 736 {
		t.Fatalf("expected settings-backed generated-entry terminal width 736, got %v", terminalPayload.Size.Width)
	}
	if terminalPayload.Size.Height != 228 {
		t.Fatalf("expected settings-backed generated-entry terminal height 228, got %v", terminalPayload.Size.Height)
	}

	terminalID := terminals.BuildTerminalID("terminal-seed-1", "")
	sessionInfo, ok := terminalService.Session(terminalID)
	if !ok {
		t.Fatalf("expected generated-entry terminal session %q to exist", terminalID)
	}
	if !sessionInfo.AllowInput {
		t.Fatalf("expected generated-entry terminal session %q to remain interactive", terminalID)
	}
	attachment := attachHTTPTestTerminal(t, terminalService, terminalID)
	syncHTTPTestTerminalSize(t, terminalService, terminalID)
	output := waitForHTTPTestOutputContains(t, terminalService, terminalID, attachment, "ROUTE_GENERATED_OK")
	if !strings.Contains(output, "ROUTE_GENERATED_OK") {
		t.Fatalf("expected generated entry output in temporary terminal, got %q", output)
	}
	if strings.Contains(output, "SETTA_RDY") {
		t.Fatalf("expected generated-entry terminal output to hide prompt-ready marker, got %q", output)
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

	existingTerminalSessionID := terminals.BuildTerminalID(existingTerminalID, "")
	openHTTPTestTerminal(t, terminalService, terminals.OpenOptions{
		ID:         existingTerminalSessionID,
		ProjectID:  "project-alpha",
		AllowInput: true,
	})

	attachment := attachHTTPTestTerminal(t, terminalService, existingTerminalSessionID)
	syncHTTPTestTerminalSize(t, terminalService, existingTerminalSessionID)
	waitForHTTPReusableSession(t, terminalService, existingTerminalSessionID, true)

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

	output := waitForHTTPTestOutputOccurrences(t, terminalService, existingTerminalSessionID, attachment, "ROUTE_GENERATED_OK", 1)
	if !strings.Contains(output, "ROUTE_GENERATED_OK") {
		t.Fatalf("expected generated entry output in reused terminal, got %q", output)
	}
	if strings.Contains(output, "SETTA_RDY") {
		t.Fatalf("expected reused generated-entry terminal output to stay clean, got %q", output)
	}
}

func TestRegisterTerminalRoutesGeneratedEntryDoesNotReuseAttachedTerminal(t *testing.T) {
	t.Parallel()
	skipIfTerminalPTYUnsupported(t)

	authService := newTestAuthService(t)
	terminalService := newHTTPTestTerminalService(t)
	runFixture := newHTTPTestRunCodeFixture(t, terminalService)

	_, attachedTerminalID, err := runFixture.runtime.EnsureCodeSectionAttachedTerminal(
		"project-alpha",
		"code-section",
		projectstate.TerminalSectionSeed{
			SectionID: "attached-terminal",
			VariantID: "attached-terminal-variant",
			ImplID:    "attached-terminal-impl",
			Name:      "Terminal",
		},
	)
	if err != nil {
		t.Fatalf("ensure attached terminal: %v", err)
	}

	attachedTerminalSessionID := terminals.BuildTerminalID(attachedTerminalID, "")
	openHTTPTestTerminal(t, terminalService, terminals.OpenOptions{
		ID:         attachedTerminalSessionID,
		ProjectID:  "project-alpha",
		AllowInput: true,
		Command:    interactiveHTTPTestBashCommand(t),
	})

	attachedAttachment := attachHTTPTestTerminal(t, terminalService, attachedTerminalSessionID)
	prepareHTTPInterruptShell(t, terminalService, attachedTerminalSessionID, attachedAttachment)

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
	if project.HasTopLevelSection(attachedTerminalID) {
		t.Fatalf("did not expect attached terminal %q to become top-level", attachedTerminalID)
	}
	if _, _, _, err := project.ResolveSection("terminal-seed-1"); err != nil {
		t.Fatalf("expected generated-entry run to allocate a new top-level terminal instead of reusing attached terminal %q: %v", attachedTerminalID, err)
	}
	if !project.HasTopLevelSection("terminal-seed-1") {
		t.Fatal("expected generated-entry run fallback terminal to be top-level")
	}

	fallbackAttachment := attachHTTPTestTerminal(t, terminalService, terminals.BuildTerminalID("terminal-seed-1", ""))
	syncHTTPTestTerminalSize(t, terminalService, terminals.BuildTerminalID("terminal-seed-1", ""))
	output := waitForHTTPTestOutputContains(t, terminalService, terminals.BuildTerminalID("terminal-seed-1", ""), fallbackAttachment, "ROUTE_GENERATED_OK")
	if !strings.Contains(output, "ROUTE_GENERATED_OK") {
		t.Fatalf("expected generated entry output in fallback top-level terminal, got %q", output)
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
		name             string
		payload          string
		expectedFragment string
	}{
		{
			name:             "cli id",
			payload:          `{"projectConfigId":"project-alpha","sectionId":"code-section","cliId":"cli-1"}`,
			expectedFragment: `"code":"unsupported_run_code_cli"`,
		},
		{
			name:             "bad section override",
			payload:          `{"projectConfigId":"project-alpha","sectionId":"code-section","sectionVariantOverrides":{"missing":"other"}}`,
			expectedFragment: `"detail":"Unknown section id: missing"`,
		},
		{
			name:             "bad param override key",
			payload:          `{"projectConfigId":"project-alpha","sectionId":"code-section","paramOverrides":{"bad":"2"}}`,
			expectedFragment: `"detail":"Invalid param override key: 'bad'"`,
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
			if !strings.Contains(response.Body.String(), testCase.expectedFragment) {
				t.Fatalf("expected response to contain %s, got %q", testCase.expectedFragment, response.Body.String())
			}
		})
	}
}

func TestRegisterTerminalRoutesRunCodeMalformedJSONReturnsValidationEnvelope(t *testing.T) {
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

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteRunCode, strings.NewReader(`{"projectConfigId":`))
	request.Header.Set("Content-Type", "application/json")
	addHTTPTestAuthCookie(t, request, authService)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}

	var payload validationErrorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode validation envelope: %v", err)
	}
	if payload.StatusCode != 10422 {
		t.Fatalf("expected validation status code 10422, got %#v", payload)
	}
	if payload.Message == "" {
		t.Fatalf("expected validation message, got %#v", payload)
	}
	if payload.Data != nil {
		t.Fatalf("expected nil validation data, got %#v", payload.Data)
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
