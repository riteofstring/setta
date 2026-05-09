package app

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/appsubsystem/appspec"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/mcpx"
	"setta/internal/observability"
	"setta/internal/projectstate"
	"setta/internal/terminals"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestAppIDEMCPToolCallRouteSupportsUtilityReadInitTools(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	seedAppSettaDocsBundle(t, cfg.Paths.WorkspaceRoot)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)

	searchResponse, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"search_mcp_tools",
			"arguments":{"query":"section size settings","limit":2}
		}`),
	)
	if err != nil {
		t.Fatalf("post search_mcp_tools tool call route: %v", err)
	}
	defer searchResponse.Body.Close()

	if searchResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(searchResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", searchResponse.StatusCode, string(body))
	}

	searchPayload := decodeAppToolCallRoutePayload(t, searchResponse.Body)
	if searchPayload.IsError {
		t.Fatalf("expected search_mcp_tools success, got %#v", searchPayload.StructuredContent)
	}
	searchResult := mustStructuredMapValue(t, searchPayload.StructuredContent)
	searchEntries := mustStructuredListValue(t, searchResult["results"])
	if len(searchEntries) == 0 || mustStructuredMapValue(t, searchEntries[0])["name"] != "set_section_sizes" {
		t.Fatalf("expected set_section_sizes search result, got %#v", searchEntries)
	}

	projectsResponse, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"getProjectConfigNamesAndIds",
			"arguments":{}
		}`),
	)
	if err != nil {
		t.Fatalf("post getProjectConfigNamesAndIds tool call route: %v", err)
	}
	defer projectsResponse.Body.Close()

	if projectsResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(projectsResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", projectsResponse.StatusCode, string(body))
	}

	projectsPayload := decodeAppToolCallRoutePayload(t, projectsResponse.Body)
	if projectsPayload.IsError {
		t.Fatalf("expected getProjectConfigNamesAndIds success, got %#v", projectsPayload.StructuredContent)
	}
	projectsResult := mustStructuredMapValue(t, projectsPayload.StructuredContent)
	projectConfigs := mustStructuredListValue(t, projectsResult["projectConfigs"])
	if len(projectConfigs) != 1 || mustStructuredMapValue(t, projectConfigs[0])["id"] != "project-alpha" {
		t.Fatalf("expected one project-alpha metadata entry, got %#v", projectConfigs)
	}

	packagesResponse, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"getInstalledPythonPackages",
			"arguments":{}
		}`),
	)
	if err != nil {
		t.Fatalf("post getInstalledPythonPackages tool call route: %v", err)
	}
	defer packagesResponse.Body.Close()

	if packagesResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(packagesResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", packagesResponse.StatusCode, string(body))
	}

	packagesPayload := decodeAppToolCallRoutePayload(t, packagesResponse.Body)
	if packagesPayload.IsError {
		t.Fatalf("expected getInstalledPythonPackages success, got %#v", packagesPayload.StructuredContent)
	}
	packagesResult := mustStructuredMapValue(t, packagesPayload.StructuredContent)
	packages := mustStringSliceValue(t, packagesResult["packages"])
	assertInstalledPythonPackages(t, packages)

	docsResponse, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"get_setta_docs",
			"arguments":{}
		}`),
	)
	if err != nil {
		t.Fatalf("post get_setta_docs tool call route: %v", err)
	}
	defer docsResponse.Body.Close()

	if docsResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(docsResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", docsResponse.StatusCode, string(body))
	}

	docsPayload := decodeAppToolCallRoutePayload(t, docsResponse.Body)
	if docsPayload.IsError {
		t.Fatalf("expected get_setta_docs success, got %#v", docsPayload.StructuredContent)
	}
	docsResult := mustStructuredMapValue(t, docsPayload.StructuredContent)
	docs := mustStructuredListValue(t, docsResult["docs"])
	if len(docs) != 4 {
		t.Fatalf("expected four default docs, got %#v", docs)
	}
}

func TestAppIDEMCPToolCallRouteSupportsReportCompletionStatus(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"report_completion_status",
			"arguments":{
				"taskId":" task-a ",
				"completionIntent":true,
				"requiresVerification":true,
				"checkResults":[
					{"checkName":"pytest","status":"passed","details":"  ok  ","source":"  go test  "}
				]
			},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"chatId":"chat-1",
				"sectionId":"chat-section"
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post report_completion_status tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	payload := decodeAppToolCallRoutePayload(t, response.Body)
	if payload.IsError {
		t.Fatalf("expected report_completion_status success, got %#v", payload.StructuredContent)
	}
	result := mustStructuredMapValue(t, payload.StructuredContent)
	if result["taskId"] != "task-a" {
		t.Fatalf("expected trimmed taskId, got %#v", result["taskId"])
	}
	if result["verificationStatus"] != "passed" {
		t.Fatalf("expected verificationStatus passed, got %#v", result["verificationStatus"])
	}
	checkResults := mustStructuredListValue(t, result["checkResults"])
	if len(checkResults) != 1 {
		t.Fatalf("expected one check result, got %#v", checkResults)
	}
}

func TestAppIDEMCPToolCallRouteSupportsAgentProfileReadTools(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	saveAppAgentProfiles(t, cfg, []agentprofiles.Profile{
		{
			ID:                          "profile-alpha",
			Name:                        "Alpha",
			Description:                 "Primary profile",
			SystemPrompt:                "You are alpha.",
			EnableBackgroundSummaryFill: true,
			EnableLlmChatTitles:         true,
			ToolAllowlist:               []string{"tool.a"},
		},
		{
			ID:           "profile-beta",
			Name:         "Beta",
			SystemPrompt: "You are beta.",
		},
	})

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)

	listResponse, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"list_agent_profiles",
			"arguments":{}
		}`),
	)
	if err != nil {
		t.Fatalf("post list_agent_profiles tool call route: %v", err)
	}
	defer listResponse.Body.Close()

	if listResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(listResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", listResponse.StatusCode, string(body))
	}

	listPayload := decodeAppToolCallRoutePayload(t, listResponse.Body)
	if listPayload.IsError {
		t.Fatalf("expected list_agent_profiles success, got %#v", listPayload.StructuredContent)
	}
	listResult := mustStructuredMapValue(t, listPayload.StructuredContent)
	profiles := mustStructuredListValue(t, listResult["profiles"])
	if len(profiles) != 2 {
		t.Fatalf("expected two agent profiles, got %#v", profiles)
	}

	getResponse, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"get_agent_profile",
			"arguments":{"profileId":"profile-alpha"}
		}`),
	)
	if err != nil {
		t.Fatalf("post get_agent_profile tool call route: %v", err)
	}
	defer getResponse.Body.Close()

	if getResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(getResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", getResponse.StatusCode, string(body))
	}

	getPayload := decodeAppToolCallRoutePayload(t, getResponse.Body)
	if getPayload.IsError {
		t.Fatalf("expected get_agent_profile success, got %#v", getPayload.StructuredContent)
	}
	profile := mustStructuredMapValue(t, getPayload.StructuredContent)
	if profile["name"] != "Alpha" {
		t.Fatalf("expected Alpha profile, got %#v", profile)
	}
}

func TestAppIDEMCPToolCallRouteSupportsRunAgentProfile(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	engineConfigID := "engine-primary"
	saveAppAgentProfiles(t, cfg, []agentprofiles.Profile{
		{
			ID:             "profile-alpha",
			Name:           "Alpha",
			Description:    "Primary profile",
			SystemPrompt:   "You are alpha.",
			EngineConfigID: &engineConfigID,
			ToolAllowlist:  []string{},
		},
	})

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)

	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"run_agent_profile",
			"arguments":{
				"profileId":"profile-alpha",
				"inputs":{"allowUnscoped":true}
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post run_agent_profile tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	payload := decodeAppToolCallRoutePayload(t, response.Body)
	if !payload.IsError {
		t.Fatalf("expected disabled run_agent_profile to fail, got %#v", payload.StructuredContent)
	}
	structured := mustStructuredMapValue(t, payload.StructuredContent)
	if structured["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", structured["code"])
	}
	if structured["message"] != `engine config not found: "engine-primary"` {
		t.Fatalf("expected missing engine-config message, got %#v", structured["message"])
	}
}

func TestAppIDEMCPToolCallRouteSupportsGetMCPServerRuntimeStatus(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	cfg.Server.Host = "127.0.0.1"
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	cfg.Server.Port = listener.Addr().(*net.TCPAddr).Port

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}

	server := &http.Server{Handler: app.Handler()}
	serverErrors := make(chan error, 1)
	go func() {
		serverErrors <- server.Serve(listener)
	}()

	serverURL := "http://" + listener.Addr().String()
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
			t.Fatalf("shutdown http server: %v", err)
		}
		err := <-serverErrors
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			t.Fatalf("serve app: %v", err)
		}
	})

	waitForAppMCPClientState(t, app, mcpx.RuntimeStateConnected)

	mcpClient := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	mcpSession, err := mcpClient.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   serverURL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, serverURL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer mcpSession.Close()

	toolsResult, err := mcpSession.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}

	client := mustAuthenticatedMCPHTTPClient(t, app, serverURL)
	response, err := client.Post(
		serverURL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"get_mcp_server_runtime_status",
			"arguments":{}
		}`),
	)
	if err != nil {
		t.Fatalf("post get_mcp_server_runtime_status tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	payload := decodeAppToolCallRoutePayload(t, response.Body)
	if payload.IsError {
		t.Fatalf("expected get_mcp_server_runtime_status success, got %#v", payload.StructuredContent)
	}
	result := mustStructuredMapValue(t, payload.StructuredContent)
	servers := mustStructuredListValue(t, result["servers"])
	if len(servers) != 1 {
		t.Fatalf("expected one server status, got %#v", servers)
	}
	serverStatus := mustStructuredMapValue(t, servers[0])
	if serverStatus["serverId"] != mcpx.DefaultServerID {
		t.Fatalf("expected default server id, got %#v", serverStatus["serverId"])
	}
	if serverStatus["state"] != string(mcpx.RuntimeStateConnected) {
		t.Fatalf("expected connected runtime state, got %#v", serverStatus["state"])
	}
	if toolCount, ok := serverStatus["toolCount"].(float64); !ok || int(toolCount) != len(toolsResult.Tools) {
		t.Fatalf("expected toolCount %d, got %#v", len(toolsResult.Tools), serverStatus["toolCount"])
	}
}

func TestAppIDEMCPToolCallRouteSupportsAppCatalogReadTools(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	enableAppSubsystemPluginForTest(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)

	catalogResponse, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"get_app_catalog",
			"arguments":{}
		}`),
	)
	if err != nil {
		t.Fatalf("post get_app_catalog tool call route: %v", err)
	}
	defer catalogResponse.Body.Close()

	if catalogResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(catalogResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", catalogResponse.StatusCode, string(body))
	}

	catalogPayload := decodeAppToolCallRoutePayload(t, catalogResponse.Body)
	if catalogPayload.IsError {
		t.Fatalf("expected get_app_catalog success, got %#v", catalogPayload.StructuredContent)
	}
	catalogResult := mustStructuredMapValue(t, catalogPayload.StructuredContent)
	catalog := mustStructuredMapValue(t, catalogResult["catalog"])
	if catalog["id"] != appspec.DefaultCatalogID {
		t.Fatalf("expected catalog id %q, got %#v", appspec.DefaultCatalogID, catalog["id"])
	}

	componentsResponse, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"list_app_components",
			"arguments":{}
		}`),
	)
	if err != nil {
		t.Fatalf("post list_app_components tool call route: %v", err)
	}
	defer componentsResponse.Body.Close()

	if componentsResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(componentsResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", componentsResponse.StatusCode, string(body))
	}

	componentsPayload := decodeAppToolCallRoutePayload(t, componentsResponse.Body)
	if componentsPayload.IsError {
		t.Fatalf("expected list_app_components success, got %#v", componentsPayload.StructuredContent)
	}
	componentsResult := mustStructuredMapValue(t, componentsPayload.StructuredContent)
	componentTypes := mustStringSliceValue(t, componentsResult["components"])
	if len(componentTypes) == 0 || componentTypes[0] != "Stack" {
		t.Fatalf("expected ordered component list, got %#v", componentTypes)
	}
}

func TestAppIDEMCPToolCallRouteSupportsGetTerminalOutput(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	sessionID := terminals.BuildTerminalID("allowed-section", "")
	if _, _, err := app.Terminals().Open(terminals.OpenOptions{
		ID:         sessionID,
		ProjectID:  "project-alpha",
		AllowInput: true,
		Command:    quietAppTestCatCommand(t),
	}); err != nil {
		t.Fatalf("open app terminal: %v", err)
	}
	attachment := attachAppTestTerminal(t, app.Terminals(), sessionID)
	if err := app.Terminals().Write(sessionID, []byte("route terminal output\n")); err != nil {
		t.Fatalf("write route terminal output: %v", err)
	}
	waitForAppTestOutputContains(t, app.Terminals(), sessionID, attachment, "route terminal output")

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"getTerminalOutput",
			"arguments":{"sectionId":"allowed-section"},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"chatId":"chat-1",
				"sectionId":"chat-section"
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post getTerminalOutput tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	payload := decodeAppToolCallRoutePayload(t, response.Body)
	if payload.IsError {
		t.Fatalf("expected getTerminalOutput success, got %#v", payload.StructuredContent)
	}
	history, ok := payload.StructuredContent.(string)
	if !ok {
		t.Fatalf("expected string terminal history, got %#v", payload.StructuredContent)
	}
	if !strings.Contains(history, "route terminal output") {
		t.Fatalf("expected route terminal history to include written output, got %q", history)
	}
}

func TestAppIDEMCPToolCallRouteGetSettaDocsRejectsPathEscapes(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	seedAppSettaDocsBundle(t, cfg.Paths.WorkspaceRoot)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"get_setta_docs",
			"arguments":{"docIds":["../outside"]}
		}`),
	)
	if err != nil {
		t.Fatalf("post get_setta_docs tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	payload := decodeAppToolCallRoutePayload(t, response.Body)
	if !payload.IsError {
		t.Fatal("expected get_setta_docs path escape to fail")
	}
	structured := mustStructuredMapValue(t, payload.StructuredContent)
	if structured["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", structured["code"])
	}
}

func TestAppIDEMCPToolCallRouteSupportsAgenticContextBody(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	beforeProject, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before route structural create: %v", err)
	}
	beforeSectionIDs := map[string]struct{}{}
	for sectionID := range beforeProject.Sections {
		beforeSectionIDs[sectionID] = struct{}{}
	}

	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"get_latest_project_state_summary",
			"arguments":{"projectConfigId":"project-alpha"},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"chatId":"chat-1",
				"sectionId":"chat-section"
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post mcp tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected scoped tool call success, got %#v", payload.StructuredContent)
	}
	summary := mustStructuredMapValue(t, payload.StructuredContent)
	projectConfig := mustStructuredMapValue(t, summary["projectConfig"])
	sectionVariantMap := mustStructuredMapValue(t, projectConfig["sectionVariantMap"])
	if _, ok := sectionVariantMap["blocked-section"]; ok {
		t.Fatalf("did not expect blocked-section in scoped summary, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["blocked-params-section"]; ok {
		t.Fatalf("did not expect blocked-params-section in scoped summary, got %#v", sectionVariantMap)
	}
}

func TestAppIDEMCPToolCallRouteSupportsScopedWriteMutation(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	beforeProject, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before route structural create: %v", err)
	}
	beforeSectionIDs := map[string]struct{}{}
	for sectionID := range beforeProject.Sections {
		beforeSectionIDs[sectionID] = struct{}{}
	}

	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_code_section_diagnostics_mute",
			"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-section","mute":true},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"chatId":"chat-1",
				"sectionId":"chat-section"
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post scoped write tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected scoped write success, got %#v", payload.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route scoped write: %v", err)
	}
	ignoreState, err := project.CodeSectionDiagnosticsIgnoreStateForSection("allowed-section")
	if err != nil {
		t.Fatalf("ignore state after route scoped write: %v", err)
	}
	if !ignoreState.Muted {
		t.Fatalf("expected allowed-section to be muted, got %#v", ignoreState)
	}

	response, err = client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_code_obj_name",
			"arguments":{"projectConfigId":"project-alpha","codeObjId":"allowed-param","name":"user-id@v2"},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"chatId":"chat-1",
				"sectionId":"chat-section"
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post set_code_obj_name tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode set_code_obj_name tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected set_code_obj_name success, got %#v", payload.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_code_obj_name: %v", err)
	}
	if got := project.CodeObjs["allowed-param"].Name; got != "user-id@v2" {
		t.Fatalf("expected code object name user-id@v2, got %q", got)
	}

	response, err = client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_param_name_and_value",
			"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-params-section","codeObjId":"allowed-param","name":"user-id@v3","value":"combined"},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"chatId":"chat-1",
				"sectionId":"chat-section"
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post set_param_name_and_value tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode set_param_name_and_value tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected set_param_name_and_value success, got %#v", payload.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_param_name_and_value: %v", err)
	}
	if got := project.CodeObjs["allowed-param"].Name; got != "user-id@v3" {
		t.Fatalf("expected code object name user-id@v3, got %q", got)
	}
	paramPayload, _, _, _, err := project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed-param after route set_param_name_and_value: %v", err)
	}
	if got := paramPayload["value"]; got != "combined" {
		t.Fatalf("expected combined param value, got %#v", got)
	}

	response, err = client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_code_section_diagnostic_code_suppression",
			"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-section","code":"reportFoo","suppress":true},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"chatId":"chat-1",
				"sectionId":"chat-section"
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post scoped suppression tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode scoped suppression tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected scoped suppression success, got %#v", payload.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route scoped suppression: %v", err)
	}
	ignoreState, err = project.CodeSectionDiagnosticsIgnoreStateForSection("allowed-section")
	if err != nil {
		t.Fatalf("ignore state after route scoped suppression: %v", err)
	}
	if len(ignoreState.SuppressedCodes) != 1 || ignoreState.SuppressedCodes[0] != "reportFoo" {
		t.Fatalf("expected reportFoo suppression, got %#v", ignoreState.SuppressedCodes)
	}

	response, err = client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_section_name",
			"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-section","name":"Allowed Renamed"},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"chatId":"chat-1",
				"sectionId":"chat-section"
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post set_section_name tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode set_section_name tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected set_section_name success, got %#v", payload.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_section_name: %v", err)
	}
	if got := project.Sections["allowed-section"].Name; got != "Allowed Renamed" {
		t.Fatalf("expected renamed section name, got %q", got)
	}

	response, err = client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_param_entered_value",
			"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-params-section","paramInfoId":"allowed-param","value":"updated"},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"chatId":"chat-1",
				"sectionId":"chat-section"
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post set_param_entered_value tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode set_param_entered_value tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected set_param_entered_value success, got %#v", payload.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_param_entered_value: %v", err)
	}
	paramPayload, _, _, _, err = project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed-param after route set_param_entered_value: %v", err)
	}
	if got := paramPayload["value"]; got != "updated" {
		t.Fatalf("expected updated param value, got %#v", got)
	}

	response, err = client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_type_error_ignore",
			"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-params-section","paramInfoId":"allowed-param","ignoreTypeErrors":true},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"chatId":"chat-1",
				"sectionId":"chat-section"
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post set_type_error_ignore tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode set_type_error_ignore tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected set_type_error_ignore success, got %#v", payload.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_type_error_ignore: %v", err)
	}
	typeErrorIgnoreState, err := project.TypeErrorIgnoreStateForSection("allowed-params-section")
	if err != nil {
		t.Fatalf("type error ignore state after route set_type_error_ignore: %v", err)
	}
	if !typeErrorIgnoreState.Params["allowed-param"] {
		t.Fatalf("expected allowed-param type-error ignore state, got %#v", typeErrorIgnoreState)
	}

	response, err = client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_code_obj_display_name",
			"arguments":{"projectConfigId":"project-alpha","codeObjId":"allowed-param","displayName":"Height"},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"chatId":"chat-1",
				"sectionId":"chat-section"
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post set_code_obj_display_name tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode set_code_obj_display_name tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected set_code_obj_display_name success, got %#v", payload.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_code_obj_display_name: %v", err)
	}
	if got := project.CodeObjs["allowed-param"].DisplayName; got != "Height" {
		t.Fatalf("expected display name Height, got %q", got)
	}
}

func TestAppIDEMCPToolCallRouteSupportsSetCode(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	seedAppWatchCodeBoundSectionProject(t, app)

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_code",
			"arguments":{"projectConfigId":"project-alpha","sectionId":"section-main","code":"def sorted(iterable):\n    return iterable\n"},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"allowUnscoped":true
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post set_code tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode set_code tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected set_code success, got %#v", payload.StructuredContent)
	}

	assertAppBoundSetCodeState(t, app, "def sorted(iterable):\n    return iterable\n")
}

func TestAppIDEMCPToolCallRouteSupportsFormatCode(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	addRepoVenvRuffToPath(t)
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	seedAppWatchCodeBoundSectionProject(t, app)
	if _, err := app.ProjectStates().Main().SetCode(
		context.Background(),
		"project-alpha",
		"section-main",
		"def sorted( iterable ):\n return iterable\n",
	); err != nil {
		t.Fatalf("seed app set_code before route format_code: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"format_code",
			"arguments":{"projectConfigId":"project-alpha","sectionId":"section-main"},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"allowUnscoped":true
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post format_code tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode format_code tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected format_code success, got %#v", payload.StructuredContent)
	}

	assertAppBoundSetCodeState(t, app, "def sorted(iterable):\n    return iterable\n")
}

func TestAppIDEMCPToolCallRouteSupportsSetTopLevelSectionLayout(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	if _, _, err := app.ProjectStates().Main().CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed view mode: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_top_level_section_layout",
			"arguments":{
				"projectConfigId":"project-alpha",
				"topLevelSections":{
					"allowed-section":{"x":438,"y":214,"zIndex":4}
				}
			},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"chatId":"chat-1",
				"sectionId":"chat-section"
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post set_top_level_section_layout tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode set_top_level_section_layout tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected set_top_level_section_layout success, got %#v", payload.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_top_level_section_layout: %v", err)
	}
	layout := project.TopLevelSections["allowed-section"]
	if layout.X != 438 || layout.Y != 214 || layout.ZIndex != 4 {
		t.Fatalf("unexpected route-persisted app layout %#v", layout)
	}
}

func TestAppIDEMCPToolCallRouteSupportsAutoLayoutTopLevelSections(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	if _, _, err := app.ProjectStates().Main().CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed view mode: %v", err)
	}
	if _, err := app.ProjectStates().Main().SetTopLevelSectionLayout(context.Background(), "project-alpha", map[string]projectstate.TopLevelSectionLayout{
		"chat-section":    {X: 10, Y: 10, ZIndex: 0},
		"allowed-section": {X: 15, Y: 15, ZIndex: 1},
		"blocked-section": {X: 20, Y: 20, ZIndex: 2},
	}); err != nil {
		t.Fatalf("seed route app auto-layout top-level layouts: %v", err)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before route auto layout: %v", err)
	}
	beforeAllowed := project.TopLevelSections["allowed-section"]
	beforeBlocked := project.TopLevelSections["blocked-section"]

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"auto_layout_top_level_sections",
			"arguments":{
				"projectConfigId":"project-alpha",
				"margin":10
			},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"allowUnscoped":true
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post auto_layout_top_level_sections tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode auto_layout_top_level_sections tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected auto_layout_top_level_sections success, got %#v", payload.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route auto layout: %v", err)
	}
	afterAllowed := project.TopLevelSections["allowed-section"]
	afterBlocked := project.TopLevelSections["blocked-section"]
	if afterAllowed == beforeAllowed && afterBlocked == beforeBlocked {
		t.Fatalf(
			"expected route auto layout to rewrite layouts, allowed before=%#v after=%#v blocked before=%#v after=%#v",
			beforeAllowed,
			afterAllowed,
			beforeBlocked,
			afterBlocked,
		)
	}
}

func TestAppIDEMCPToolCallRouteSupportsSetSectionTagColor(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_section_tag_color",
			"arguments":{
				"projectConfigId":"project-alpha",
				"sectionId":"allowed-section",
				"tagColor":"#123456"
			},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"chatId":"chat-1",
				"sectionId":"chat-section"
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post set_section_tag_color tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode set_section_tag_color tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected set_section_tag_color success, got %#v", payload.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_section_tag_color: %v", err)
	}
	allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-section"].SharedModifier)
	if got := allowedPayload["tagColor"]; got != "#123456" {
		t.Fatalf("expected allowed-section tagColor #123456 after route mutation, got %#v", got)
	}
}

func TestAppIDEMCPToolCallRouteSupportsSetSectionStyleColor(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_section_style_color",
			"arguments":{
				"projectConfigId":"project-alpha",
				"sectionId":"allowed-section",
				"styleColor":"#654321"
			},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"chatId":"chat-1",
				"sectionId":"chat-section"
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post set_section_style_color tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode set_section_style_color tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected set_section_style_color success, got %#v", payload.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_section_style_color: %v", err)
	}
	allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-section"].SharedModifier)
	if got := allowedPayload["styleColor"]; got != "#654321" {
		t.Fatalf("expected allowed-section styleColor #654321 after route mutation, got %#v", got)
	}
}

func TestAppIDEMCPToolCallRouteSupportsSetSectionParamFilter(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"set_section_param_filter",
			"arguments":{
				"projectConfigId":"project-alpha",
				"sectionId":"allowed-params-section",
				"paramFilter":"   "
			},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"chatId":"chat-1",
				"sectionId":"chat-section"
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post set_section_param_filter tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode set_section_param_filter tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected set_section_param_filter success, got %#v", payload.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_section_param_filter: %v", err)
	}
	allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-params-section"].SharedModifier)
	if got := allowedPayload["paramFilter"]; got != "   " {
		t.Fatalf("expected allowed-params-section raw paramFilter whitespace after route mutation, got %#v", got)
	}
}
