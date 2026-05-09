package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"setta/internal/agentruns"
	"setta/internal/auth"
	binarypayload "setta/internal/binary"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/lsp"
	"setta/internal/observability"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/settingsstate"
	"setta/internal/terminals"
	"setta/internal/testutil/firstpartyplugin"
	"setta/internal/watchcodecontracts"
)

func TestAppServesSetProjectConfigCodegenTargetsRouteForPython(t *testing.T) {
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

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = projectstate.Project{
			ID:                 "project-alpha",
			Name:               "Alpha",
			TopLevelSectionIDs: []string{"section-1"},
			SectionVariantMap: map[string]string{
				"section-1": "section-variant-1",
			},
			Sections: map[string]projectstate.Section{
				"section-1": {
					ID:               "section-1",
					Name:             "Greeting",
					VariantIDs:       []string{"section-variant-1"},
					DefaultVariantID: "section-variant-1",
				},
			},
			SectionVariants: map[string]projectstate.SectionVariant{
				"section-variant-1": {
					ID:     "section-variant-1",
					ImplID: "section-impl-1",
				},
			},
			SectionImpls: map[string]projectstate.SectionImpl{
				"section-impl-1": {
					ID:   "section-impl-1",
					Kind: projectstate.SectionKind("text_block"),
					Payload: mustAppJSON(t, map[string]any{
						"id":   "section-impl-1",
						"type": "TextBlock",
						"text": "hello world",
					}),
				},
			},
			ViewModes: map[string]projectstate.ViewMode{
				"focus": {
					ID: "focus",
				},
			},
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed project runtime: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteSetProjectConfigCodegenTargets,
		strings.NewReader(`{"projectConfigId":"project-alpha","codegenTargets":[{"language":"python","generateMetadata":true}]}`),
	)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post codegen targets: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload projectview.SingleConfig
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode project state response: %v", err)
	}
	if payload.SingletonSections.GenPythonCode == nil || *payload.SingletonSections.GenPythonCode != projectstate.GeneratedPythonCodeSectionID {
		t.Fatalf("expected generated python singleton, got %#v", payload.SingletonSections.GenPythonCode)
	}
	if payload.SingletonSections.GenPythonMetadata == nil || *payload.SingletonSections.GenPythonMetadata != projectstate.GeneratedPythonMetadataSectionID {
		t.Fatalf("expected generated python metadata singleton, got %#v", payload.SingletonSections.GenPythonMetadata)
	}

	codeVariantID := payload.ProjectConfig.SectionVariantMap[projectstate.GeneratedPythonCodeSectionID]
	codeImplID := payload.SectionVariants[codeVariantID].Impl
	if !strings.Contains(string(payload.SectionImpls[codeImplID]), `state.Greeting = 'hello world'`) {
		t.Fatalf("expected generated python body in response payload, got %q", string(payload.SectionImpls[codeImplID]))
	}

	projectRoot := projectstate.ProjectCodeSectionsRoot(cfg.Paths.SettaFilesRoot, "Alpha")
	codePath := filepath.Join(projectRoot, projectstate.GeneratedPythonCodeFileName)
	metaPath := filepath.Join(projectRoot, projectstate.GeneratedPythonMetadataFileName)
	code, err := os.ReadFile(codePath)
	if err != nil {
		t.Fatalf("read generated python code: %v", err)
	}
	if !strings.Contains(string(code), "state.Greeting = 'hello world'") {
		t.Fatalf("expected generated python code file:\n%s", string(code))
	}
	if _, err := os.Stat(metaPath); err != nil {
		t.Fatalf("expected generated python metadata file, got %v", err)
	}
}

func TestAppServesRunCodeRouteWithDrawSnapshots(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	seedAppRunCodeProject(t, app, cfg, "print('APP_RUN_OK')\n")

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}
	authCookie := &http.Cookie{
		Name:  cookieName,
		Value: token,
	}

	uploadBody, uploadContentType := buildAppBinaryUploadBody(t, []byte("snapshot-bytes"), "false")
	uploadRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteBinaryUpload, uploadBody)
	if err != nil {
		t.Fatalf("new binary upload request: %v", err)
	}
	uploadRequest.Header.Set("Content-Type", uploadContentType)
	uploadRequest.AddCookie(authCookie)

	uploadResponse, err := http.DefaultClient.Do(uploadRequest)
	if err != nil {
		t.Fatalf("post binary upload: %v", err)
	}
	defer uploadResponse.Body.Close()
	if uploadResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(uploadResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", uploadResponse.StatusCode, string(body))
	}

	var ref binarypayload.ContentRef
	if err := json.NewDecoder(uploadResponse.Body).Decode(&ref); err != nil {
		t.Fatalf("decode binary upload response: %v", err)
	}

	runRequestBody, err := json.Marshal(httpapi.RunCodeRequest{
		ProjectID:       "project-alpha",
		SectionID:       "code-section",
		RunSnapshotMode: "never",
		DrawSnapshotsBySectionID: map[string]binarypayload.ContentRef{
			"draw-section": ref,
		},
	})
	if err != nil {
		t.Fatalf("marshal run code request: %v", err)
	}

	runRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteRunCode, bytes.NewReader(runRequestBody))
	if err != nil {
		t.Fatalf("new run code request: %v", err)
	}
	runRequest.Header.Set("Content-Type", "application/json")
	runRequest.AddCookie(authCookie)

	runResponse, err := http.DefaultClient.Do(runRequest)
	if err != nil {
		t.Fatalf("post run code: %v", err)
	}
	defer runResponse.Body.Close()
	if runResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(runResponse.Body)
		t.Fatalf("expected 200, got %d with body %q", runResponse.StatusCode, string(body))
	}

	drawSnapshotPath, err := projectstate.BuildDrawSnapshotPath("draw-section", filepath.Join(cfg.Paths.SettaFilesRoot, "artifacts"))
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

	snapshot := app.ProjectStates().Main().Snapshot()
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

	if _, err := app.binaryStore.ReadBytes(ref.ContentID); !errors.Is(err, binarypayload.ErrPayloadNotFound) {
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
	attachment := attachAppTestTerminal(t, app.Terminals(), terminalID)
	output := waitForAppTestOutputContains(t, app.Terminals(), terminalID, attachment, "APP_RUN_OK")
	if !strings.Contains(output, "APP_RUN_OK") {
		t.Fatalf("expected run output in attached terminal, got %q", output)
	}
}

func TestAppServesRunCodeRouteWithSectionVariantOverrides(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	seedAppRunCodeProject(t, app, cfg, "print('APP_RUN_OK')\n")

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}

	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteRunCode, strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"code-section","runSnapshotMode":"never","sectionVariantOverrides":{"code-section":"code-bash-variant"}}`))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post run code: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	snapshot := app.ProjectStates().Main().Snapshot()
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
	attachment := attachAppTestTerminal(t, app.Terminals(), terminalID)
	output := waitForAppTestOutputContains(t, app.Terminals(), terminalID, attachment, "APP_BASH_OK")
	if !strings.Contains(output, "APP_BASH_OK") {
		t.Fatalf("expected bash override output in attached terminal, got %q", output)
	}
}

func TestAppRunCodeRouteRejectsUnsupportedCLIID(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppLSPFixture(t)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	seedAppRunCodeProject(t, app, cfg, "print('APP_RUN_OK')\n")

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}

	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteRunCode, strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"code-section","cliId":"cli-1"}`))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post run code: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusBadRequest {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 400, got %d with body %q", response.StatusCode, string(body))
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read response body: %v", err)
	}
	if !strings.Contains(string(body), `"code":"unsupported_run_code_cli"`) {
		t.Fatalf("expected unsupported_run_code_cli error, got %q", string(body))
	}
}

func waitForAppCondition(t *testing.T, timeout time.Duration, check func() bool) {
	t.Helper()

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if check() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("timed out waiting for condition")
}

func appTestMessageText(message map[string]any) string {
	content, ok := message["content"].([]any)
	if !ok {
		return ""
	}
	for _, entry := range content {
		block, ok := entry.(map[string]any)
		if !ok {
			continue
		}
		blockType, _ := block["type"].(string)
		if strings.TrimSpace(blockType) != "text" {
			continue
		}
		text, _ := block["text"].(string)
		if text != "" {
			return text
		}
	}
	return ""
}

func appTestStringList(value any) []string {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	result := make([]string, 0, len(items))
	for _, item := range items {
		text, ok := item.(string)
		if !ok || strings.TrimSpace(text) == "" {
			continue
		}
		result = append(result, text)
	}
	return result
}

func appTestMessageTextMapList(value any) []map[string]any {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	result := make([]map[string]any, 0, len(items))
	for _, item := range items {
		message, ok := item.(map[string]any)
		if !ok {
			continue
		}
		result = append(result, message)
	}
	return result
}

func appTestHasRunEventType(run agentruns.Run, eventType string) bool {
	for _, event := range run.Events {
		if strings.TrimSpace(event.Type) == eventType {
			return true
		}
	}
	return false
}

func appManagedWorkflowTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	inlinePrompt := "Review the draft."
	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		TopLevelSectionIDs: []string{
			"start-section",
			"chat-section",
			"end-section",
		},
		SectionVariantMap: map[string]string{
			"start-section": "start-variant",
			"chat-section":  "chat-variant",
			"end-section":   "end-variant",
		},
		Sections: map[string]projectstate.Section{
			"start-section": {ID: "start-section", Name: "Start Section", VariantIDs: []string{"start-variant"}, DefaultVariantID: "start-variant"},
			"chat-section":  {ID: "chat-section", Name: "Review Chat", VariantIDs: []string{"chat-variant"}, DefaultVariantID: "chat-variant"},
			"end-section":   {ID: "end-section", Name: "End Section", VariantIDs: []string{"end-variant"}, DefaultVariantID: "end-variant"},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"start-variant": {ID: "start-variant", ImplID: "start-impl"},
			"chat-variant":  {ID: "chat-variant", ImplID: "chat-impl"},
			"end-variant":   {ID: "end-variant", ImplID: "end-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"start-impl": {
				ID:      "start-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustMarshalAppWorkflowObject(t, map[string]any{"id": "start-impl", "type": "StateMachineStart", "machineGroupId": "workflow-a", "label": "Kickoff"}),
			},
			"chat-impl": {
				ID:   "chat-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustMarshalAppWorkflowObject(t, map[string]any{
					"id":             "chat-impl",
					"type":           "Chat",
					"engineConfigId": "engine-managed",
					"agentProfileId": nil,
					"permissionMode": "minimal",
					"searchEnabled":  false,
					"chatId":         nil,
				}),
			},
			"end-impl": {
				ID:      "end-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustMarshalAppWorkflowObject(t, map[string]any{"id": "end-impl", "type": "StateMachineEnd", "machineGroupId": "workflow-a", "label": "Done"}),
			},
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
					InlinePrompt:   &inlinePrompt,
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
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize workflow app test project: %v", err)
	}
	return project
}

func setAppCompletionGuardEnabled(t *testing.T, app *App, enabled bool) {
	t.Helper()

	if _, err := app.SettingsState().MutateAndSave(context.Background(), func(document settingsstate.Document) (settingsstate.Document, error) {
		document["backend"].(map[string]any)["completionGuardEnabled"] = enabled
		return document, nil
	}); err != nil {
		t.Fatalf("set completion guard enabled=%t: %v", enabled, err)
	}
}

func mustMarshalAppWorkflowObject(t *testing.T, payload map[string]any) projectstate.RawJSON {
	t.Helper()

	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal workflow app test payload: %v", err)
	}
	return projectstate.RawJSON(raw)
}

func testConfig(t *testing.T) config.Config {
	t.Helper()

	tmpDir := t.TempDir()
	workspaceRoot := filepath.Join(tmpDir, "workspace")
	settaHome := filepath.Join(tmpDir, ".setta")
	settaFilesRoot := filepath.Join(workspaceRoot, "setta_files")

	return config.Config{
		Server: config.Server{
			Mode:     config.ModeLauncher,
			Host:     "127.0.0.1",
			Port:     61234,
			LogLevel: 0,
		},
		Paths: config.Paths{
			WorkspaceRoot:         workspaceRoot,
			SettaHome:             settaHome,
			ProfileLookupHome:     settaHome,
			SettaFilesRoot:        settaFilesRoot,
			ResolvedFilesLocation: config.ResolvedFilesLocationLocal,
			RuntimeRoot:           filepath.Join(settaFilesRoot, "runtime"),
		},
		User: config.UserConfig{
			GlobalSettaFilesBase: filepath.Join(settaHome, "setta_files"),
			AutoMode:             config.AutoModeCreateLocal,
		},
	}
}

func newAppTestAuthCookie(t *testing.T, app *App) *http.Cookie {
	t.Helper()

	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}
	return &http.Cookie{
		Name:  cookieName,
		Value: token,
	}
}

func fetchAppLatestLSPDiagnostics(
	t *testing.T,
	serverURL string,
	cookie *http.Cookie,
	projectID string,
) projectstate.LSPDiagnosticsPayload {
	t.Helper()

	request, err := http.NewRequest(
		http.MethodPost,
		serverURL+"/api"+httpapi.RouteGetLatestLSPDiagnostics,
		strings.NewReader(`{"projectConfigId":`+strconv.Quote(projectID)+`}`),
	)
	if err != nil {
		t.Fatalf("new diagnostics request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(cookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post diagnostics request: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected diagnostics 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload projectstate.LSPDiagnosticsPayload
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode diagnostics payload: %v", err)
	}
	return payload
}

func fetchAppPluginRuntimeStatus(
	t *testing.T,
	serverURL string,
	cookie *http.Cookie,
) []plugins.PluginStatusEntry {
	t.Helper()
	return fetchAppPluginRuntime(t, serverURL, cookie).Status.Plugins
}

func fetchAppPluginRuntime(
	t *testing.T,
	serverURL string,
	cookie *http.Cookie,
) plugins.PluginRuntimeResponse {
	t.Helper()

	request, err := http.NewRequest(http.MethodGet, serverURL+"/api"+httpapi.RoutePluginsRuntime, nil)
	if err != nil {
		t.Fatalf("new plugin runtime request: %v", err)
	}
	request.AddCookie(cookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("get plugin runtime: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected plugin runtime 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload plugins.PluginRuntimeResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode plugin runtime payload: %v", err)
	}
	return payload
}

func restartAppLanguageServer(t *testing.T, serverURL string, cookie *http.Cookie) *http.Response {
	t.Helper()

	request, err := http.NewRequest(http.MethodPost, serverURL+"/api"+httpapi.RouteRestartLanguageServer, strings.NewReader("null"))
	if err != nil {
		t.Fatalf("new restart language server request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(cookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post restart language server: %v", err)
	}
	return response
}

func restartAppPlugins(t *testing.T, serverURL string, cookie *http.Cookie) *http.Response {
	t.Helper()

	request, err := http.NewRequest(http.MethodPost, serverURL+"/api"+httpapi.RoutePluginsRestart, nil)
	if err != nil {
		t.Fatalf("new plugins restart request: %v", err)
	}
	request.AddCookie(cookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post plugins restart: %v", err)
	}
	return response
}

func rescanAppPlugins(t *testing.T, serverURL string, cookie *http.Cookie) *http.Response {
	t.Helper()

	request, err := http.NewRequest(http.MethodPost, serverURL+"/api"+httpapi.RoutePluginsRescan, nil)
	if err != nil {
		t.Fatalf("new plugins rescan request: %v", err)
	}
	request.AddCookie(cookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post plugins rescan: %v", err)
	}
	return response
}

func postAppPluginLifecycle(t *testing.T, app *App, serverURL string, route string, body string) {
	t.Helper()

	request, err := http.NewRequest(http.MethodPost, serverURL+"/api"+route, strings.NewReader(body))
	if err != nil {
		t.Fatalf("new plugin lifecycle request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(newAppTestAuthCookie(t, app))

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post plugin lifecycle request: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("expected plugin lifecycle 200, got %d with body %q", response.StatusCode, string(payload))
	}
}

func postAppWatchCodePluginRoute(
	t *testing.T,
	serverURL string,
	cookie *http.Cookie,
	pluginID string,
	route string,
	body string,
) *http.Response {
	t.Helper()

	request, err := http.NewRequest(
		http.MethodPost,
		serverURL+"/plugins/"+pluginID+"/watch-code/"+route,
		strings.NewReader(body),
	)
	if err != nil {
		t.Fatalf("new watch code plugin route request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(cookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post watch code plugin route: %v", err)
	}
	return response
}

func postAppPluginConfig(t *testing.T, serverURL string, cookie *http.Cookie, pluginID string, config any) *http.Response {
	t.Helper()

	requestBody := mustAppJSON(t, map[string]any{
		"pluginId": pluginID,
		"config":   config,
	})
	request, err := http.NewRequest(http.MethodPost, serverURL+"/api"+httpapi.RoutePluginsConfig, bytes.NewReader(requestBody))
	if err != nil {
		t.Fatalf("new plugins config request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(cookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post plugins config: %v", err)
	}
	return response
}

func writeAppPluginConfig(t *testing.T, serverURL string, cookie *http.Cookie, pluginID string, config any) {
	t.Helper()

	response := postAppPluginConfig(t, serverURL, cookie, pluginID, config)
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("expected plugins config 200, got %d with body %q", response.StatusCode, string(payload))
	}
}

func cloneAppRuntimeLanguageServerSpecs(t *testing.T, app *App) ([]lsp.LanguageServerSpec, []lsp.LanguageServerSpec) {
	t.Helper()

	app.pluginRuntime.mu.Lock()
	defer app.pluginRuntime.mu.Unlock()

	return cloneLanguageServerSpecs(app.pluginRuntime.lspSpecs), cloneLanguageServerSpecs(app.pluginRuntime.appliedLSPSpecs)
}

func writeAppPendingRestartPluginState(t *testing.T, cfg config.Config, pluginIDs ...string) {
	t.Helper()

	writeAppPendingRestartPluginStateWithLanguageServerOnlyIDs(t, cfg, pluginIDs, pluginIDs)
}

func writeDisabledAppPluginState(t *testing.T, cfg config.Config, pluginIDs ...string) {
	t.Helper()

	pluginsStatePayload, err := json.Marshal(map[string]any{
		"disabledPluginIds": pluginIDs,
	})
	if err != nil {
		t.Fatalf("marshal disabled plugin state: %v", err)
	}
	if err := os.WriteFile(filepath.Join(cfg.Paths.SettaFilesRoot, "plugins_state.json"), pluginsStatePayload, 0o644); err != nil {
		t.Fatalf("write disabled plugin state: %v", err)
	}
}

func writeAppPendingRestartPluginStateWithLanguageServerOnlyIDs(
	t *testing.T,
	cfg config.Config,
	pluginIDs []string,
	languageServerOnlyPluginIDs []string,
) {
	t.Helper()

	pluginsStatePayload, err := json.Marshal(map[string]any{
		"pendingRestartBackendPluginIds":            pluginIDs,
		"pendingRestartLanguageServerOnlyPluginIds": languageServerOnlyPluginIDs,
	})
	if err != nil {
		t.Fatalf("marshal plugin state: %v", err)
	}
	if err := os.WriteFile(filepath.Join(cfg.Paths.SettaFilesRoot, "plugins_state.json"), pluginsStatePayload, 0o644); err != nil {
		t.Fatalf("write pending restart plugin state: %v", err)
	}
}

func readAppPluginsState(t *testing.T, cfg config.Config) plugins.PluginsStateFile {
	t.Helper()

	var persistedState plugins.PluginsStateFile
	contents, err := os.ReadFile(filepath.Join(cfg.Paths.SettaFilesRoot, "plugins_state.json"))
	if err != nil {
		t.Fatalf("read persisted plugin state: %v", err)
	}
	if err := json.Unmarshal(contents, &persistedState); err != nil {
		t.Fatalf("decode persisted plugin state: %v", err)
	}
	return persistedState
}

func expectAppFixturePluginPendingRestartState(
	t *testing.T,
	cfg config.Config,
	serverURL string,
	cookie *http.Cookie,
	phase string,
) {
	t.Helper()

	status := fetchAppPluginRuntimeStatus(t, serverURL, cookie)
	entry := mustFindAppPluginStatusEntry(t, status, "setta-fixture-backend")
	if entry.State != plugins.PluginRuntimeStatePendingRestart || !entry.RestartRequired {
		t.Fatalf("expected fixture plugin pending restart %s, got %#v", phase, entry)
	}
	if len(entry.AppliedLanguageServerLanguages) != 0 {
		t.Fatalf("expected no applied fixture languages %s, got %#v", phase, entry.AppliedLanguageServerLanguages)
	}
	persistedState := readAppPluginsState(t, cfg)
	if len(persistedState.PendingRestartBackendPluginIDs) != 1 || persistedState.PendingRestartBackendPluginIDs[0] != "setta-fixture-backend" {
		t.Fatalf("expected pending restart ids to keep fixture plugin %s, got %#v", phase, persistedState.PendingRestartBackendPluginIDs)
	}
	if completions := requestAppCodeAreaCompletion(t, serverURL, cookie, "project-alpha", "runner", "fixture.", 8); len(completions) != 0 {
		t.Fatalf("expected no fixture completions %s, got %#v", phase, completions)
	}
}

func expectAppFixturePluginAppliedState(t *testing.T, serverURL string, cookie *http.Cookie, phase string) {
	t.Helper()

	status := fetchAppPluginRuntimeStatus(t, serverURL, cookie)
	entry := mustFindAppPluginStatusEntry(t, status, "setta-fixture-backend")
	if entry.State != plugins.PluginRuntimeStateActive || entry.RestartRequired {
		t.Fatalf("expected fixture plugin active %s, got %#v", phase, entry)
	}
	if len(entry.AppliedLanguageServerLanguages) != 1 || entry.AppliedLanguageServerLanguages[0] != "fixturedsl" {
		t.Fatalf("expected fixture plugin to apply fixturedsl %s, got %#v", phase, entry.AppliedLanguageServerLanguages)
	}
	if completions := requestAppCodeAreaCompletion(t, serverURL, cookie, "project-alpha", "runner", "fixture.", 8); len(completions) != 1 || completions[0].Label != "fixtureCompletion" {
		t.Fatalf("expected fixture completions %s, got %#v", phase, completions)
	}
}

func mustFindAppPluginStatusEntry(
	t *testing.T,
	entries []plugins.PluginStatusEntry,
	pluginID string,
) plugins.PluginStatusEntry {
	t.Helper()

	for _, entry := range entries {
		if entry.PluginID == pluginID && entry.ShadowedBySourcePath == nil {
			return entry
		}
	}
	t.Fatalf("expected plugin status entry %q in %#v", pluginID, entries)
	return plugins.PluginStatusEntry{}
}

func mustFindAppLanguageServerSelectionStatus(
	t *testing.T,
	selections []plugins.LanguageServerSelectionStatus,
	language string,
) plugins.LanguageServerSelectionStatus {
	t.Helper()

	for _, selection := range selections {
		if selection.Language == language {
			return selection
		}
	}
	t.Fatalf("expected language server selection status %q in %#v", language, selections)
	return plugins.LanguageServerSelectionStatus{}
}

func saveAppMainProjectDocument(t *testing.T, cfg config.Config, document projectstate.Document) error {
	t.Helper()

	paths, err := projectstate.ResolvePaths(cfg.Paths.SettaFilesRoot)
	if err != nil {
		return err
	}
	store, err := projectstate.NewStore(paths.Main, projectstate.StoreOptions{})
	if err != nil {
		return err
	}
	return store.Save(context.Background(), document)
}

func seedAppEmptyProject(t *testing.T, app *App) {
	t.Helper()

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate empty project: %v", err)
	}
	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save empty project: %v", err)
	}
}

func waitForAppWatchCodeProject(
	t *testing.T,
	app *App,
	projectID string,
	predicate func(projectstate.Project, projectstate.WatchCodePluginProjectData) bool,
) {
	t.Helper()

	timeout := time.After(15 * time.Second)
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	for {
		snapshot := app.ProjectStates().Main().Snapshot()
		project, ok := snapshot.Document.Projects[projectID]
		projectData := readAppWatchCodePluginProjectData(t, snapshot.Document, projectID)
		if ok && predicate(project, projectData) {
			return
		}

		select {
		case <-timeout:
			t.Fatalf("timed out waiting for watch code project state for %q; latest snapshot %#v", projectID, snapshot.Document.Projects[projectID])
		case <-ticker.C:
		}
	}
}

func waitForAppWatchCodeCallable(t *testing.T, app *App, projectID string, entryKey string, sourcePath string) {
	t.Helper()

	waitForAppWatchCodeProject(t, app, projectID, func(project projectstate.Project, projectData projectstate.WatchCodePluginProjectData) bool {
		entry, ok := projectData.Registry[entryKey]
		if !ok || entry.SourcePath != sourcePath || len(entry.SectionIDs) != 1 || entry.SectionsCount != 1 {
			return false
		}
		_, _, _, err := project.ResolveSection(entry.SectionIDs[0])
		return err == nil
	})
}

func waitForAppProjectMissing(t *testing.T, app *App, projectID string) {
	t.Helper()

	timeout := time.After(15 * time.Second)
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	for {
		snapshot := app.ProjectStates().Main().Snapshot()
		if _, ok := snapshot.Document.Projects[projectID]; !ok {
			return
		}

		select {
		case <-timeout:
			t.Fatalf("timed out waiting for project %q to be removed; latest snapshot %#v", projectID, snapshot.Document.Projects[projectID])
		case <-ticker.C:
		}
	}
}

func seedAppRunCodeProject(t *testing.T, app *App, cfg config.Config, source string) {
	t.Helper()

	codeRoot := filepath.Join(cfg.Paths.SettaFilesRoot, "code")
	if err := os.MkdirAll(codeRoot, 0o755); err != nil {
		t.Fatalf("mkdir code root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(codeRoot, "run.py"), []byte(source), 0o644); err != nil {
		t.Fatalf("write run.py: %v", err)
	}
	if err := os.WriteFile(filepath.Join(codeRoot, "run.sh"), []byte("echo APP_BASH_OK\n"), 0o644); err != nil {
		t.Fatalf("write run.sh: %v", err)
	}
	if err := os.WriteFile(filepath.Join(codeRoot, "helper.py"), []byte("print('helper')\n"), 0o644); err != nil {
		t.Fatalf("write helper.py: %v", err)
	}

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["project-alpha"] = projectstate.Project{
			ID:               "project-alpha",
			Name:             "Alpha",
			EntryCodeBlockID: "code-section",
			TopLevelSectionIDs: []string{
				"code-section",
				"helper-section",
				"draw-section",
			},
			SectionVariantMap: map[string]string{
				"code-section":   "code-python-variant",
				"helper-section": "helper-variant",
				"draw-section":   "draw-variant",
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
			},
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate project runtime: %v", err)
	}
	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save project runtime: %v", err)
	}
}

func seedAppLSPCodeSectionProject(t *testing.T, app *App) {
	t.Helper()

	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguagePython, "print('runner')\n")
}

func seedAppLSPCodeSectionProjectWithSource(t *testing.T, app *App, source string) {
	t.Helper()

	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguagePython, source)
}

func seedAppLSPCodeSectionProjectWithLanguage(t *testing.T, app *App, language projectstate.CodeLanguage, source string) {
	t.Helper()

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
			SectionVariantMap: map[string]string{
				"runner": "runner-variant",
			},
			Sections: map[string]projectstate.Section{
				"runner": {
					ID:               "runner",
					Name:             "Runner",
					VariantIDs:       []string{"runner-variant"},
					DefaultVariantID: "runner-variant",
				},
			},
			SectionVariants: map[string]projectstate.SectionVariant{
				"runner-variant": {
					ID:     "runner-variant",
					ImplID: "runner-impl",
				},
			},
			SectionImpls: map[string]projectstate.SectionImpl{
				"runner-impl": {
					ID:   "runner-impl",
					Kind: projectstate.SectionKindCode,
					Code: &projectstate.CodeSectionImpl{
						Language: language,
					},
					Payload: mustAppJSON(t, map[string]any{
						"id":           "runner-impl",
						"type":         "Code",
						"code":         source,
						"codeLanguage": string(language),
						"children":     []string{},
					}),
				},
			},
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate lsp code section project: %v", err)
	}
}

func seedAppPythonCodegenProject(t *testing.T, app *App) {
	t.Helper()

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["project-alpha"] = projectstate.Project{
			ID:                    "project-alpha",
			Name:                  "Alpha",
			EntryCodeBlockID:      "section-1",
			ShowParamDisplayNames: true,
			PreviewImgColor:       "#112233",
			CodegenTargets: []projectstate.ProjectCodegenTarget{
				{
					Language: string(projectstate.CodeLanguagePython),
					Payload: mustAppJSON(t, map[string]any{
						"language":         string(projectstate.CodeLanguagePython),
						"generateMetadata": true,
					}),
				},
			},
			TopLevelSectionIDs: []string{"section-1"},
			SectionVariantMap: map[string]string{
				"section-1": "section-variant-1",
			},
			Sections: map[string]projectstate.Section{
				"section-1": {
					ID:               "section-1",
					Name:             "Greeting",
					VariantIDs:       []string{"section-variant-1"},
					DefaultVariantID: "section-variant-1",
				},
			},
			SectionVariants: map[string]projectstate.SectionVariant{
				"section-variant-1": {
					ID:     "section-variant-1",
					Name:   "Greeting Variant",
					ImplID: "section-impl-1",
				},
			},
			SectionImpls: map[string]projectstate.SectionImpl{
				"section-impl-1": {
					ID:   "section-impl-1",
					Kind: projectstate.SectionKind("text_block"),
					Payload: mustAppJSON(t, map[string]any{
						"id":   "section-impl-1",
						"type": "TextBlock",
						"text": "hello world",
					}),
				},
			},
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate project runtime: %v", err)
	}
}

func seedAppWatchCodeBoundSectionProject(t *testing.T, app *App) {
	t.Helper()

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
			CodegenTargets: []projectstate.ProjectCodegenTarget{
				{
					Language: string(projectstate.CodeLanguagePython),
					Payload:  mustAppJSON(t, map[string]any{"language": string(projectstate.CodeLanguagePython)}),
				},
			},
			SectionVariantMap: map[string]string{
				"section-main": "variant-main",
			},
			Sections: map[string]projectstate.Section{
				"section-main": {
					ID:               "section-main",
					Name:             "Main",
					VariantIDs:       []string{"variant-main"},
					DefaultVariantID: "variant-main",
					UnsharedKeys:     []string{"code"},
				},
			},
			SectionVariants: map[string]projectstate.SectionVariant{
				"variant-main": {
					ID:               "variant-main",
					ImplID:           "impl-main",
					NonPresetImplIDs: []string{"impl-main"},
				},
			},
			SectionImpls: map[string]projectstate.SectionImpl{
				"impl-main": {
					ID:   "impl-main",
					Kind: projectstate.SectionKindCode,
					Code: &projectstate.CodeSectionImpl{
						Language: projectstate.CodeLanguagePython,
						Binding: &projectstate.CodeFileBinding{
							Path:       "pkg/bound.py",
							AccessMode: projectstate.CodeFileAccessModeReadWrite,
						},
					},
					Payload: mustAppJSON(t, map[string]any{
						"id":   "impl-main",
						"type": "Code",
						"code": "def existing(value):\n    return value\n",
						"codeFileBinding": map[string]any{
							"canonical_path": "pkg/bound.py",
							"access_mode":    "read_write",
						},
						"codeLanguage": "python",
						"children":     []string{},
					}),
				},
			},
		}
		document.DefaultProjectID = "project-alpha"
		setAppWatchCodePluginProjectData(t, &document, "project-alpha", projectstate.WatchCodePluginProjectData{
			Files: []string{"pkg/bound.py"},
		})
		return document, nil
	}); err != nil {
		t.Fatalf("mutate watch code bound section project: %v", err)
	}
}

func appWatchCodeCallableRegistryProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"callable-section": "callable-variant",
		},
		Sections: map[string]projectstate.Section{
			"callable-section": {
				ID:               "callable-section",
				Name:             "Callable",
				VariantIDs:       []string{"callable-variant"},
				DefaultVariantID: "callable-variant",
				UnsharedKeys:     []string{"callable", "codeObjVariantMap"},
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"callable-variant": {
				ID:     "callable-variant",
				ImplID: "callable-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"callable-impl": {
				ID:   "callable-impl",
				Kind: projectstate.SectionKind("callable"),
				Payload: mustAppJSON(t, map[string]any{
					"id":       "callable-impl",
					"type":     "Callable",
					"callable": "seed-callable",
					"codeObjVariantMap": map[string]string{
						"seed-callable":   "seed-callable-variant",
						"target-callable": "target-callable-variant",
					},
				}),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"seed-callable": {
				ID:               "seed-callable",
				Name:             "seed_callable",
				VariantIDs:       []string{"seed-callable-variant"},
				DefaultVariantID: "seed-callable-variant",
			},
			"target-callable": {
				ID:               "target-callable",
				Name:             "target_callable",
				VariantIDs:       []string{"target-callable-variant"},
				DefaultVariantID: "target-callable-variant",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"seed-callable-variant": {
				ID:     "seed-callable-variant",
				ImplID: "seed-callable-impl",
			},
			"target-callable-variant": {
				ID:     "target-callable-variant",
				ImplID: "target-callable-impl",
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"seed-callable-impl": {
				ID:      "seed-callable-impl",
				Type:    "CodeCallable",
				Payload: mustAppJSON(t, map[string]any{"id": "seed-callable-impl", "type": "CodeCallable", "children": []string{}}),
			},
			"target-callable-impl": {
				ID:      "target-callable-impl",
				Type:    "CodeCallable",
				Payload: mustAppJSON(t, map[string]any{"id": "target-callable-impl", "type": "CodeCallable", "children": []string{}}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize callable registry project: %v", err)
	}
	return project
}

func seedAppRootWatchCodeBoundSectionProject(t *testing.T, app *App) {
	t.Helper()

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
			CodegenTargets: []projectstate.ProjectCodegenTarget{
				{
					Language: string(projectstate.CodeLanguagePython),
					Payload:  mustAppJSON(t, map[string]any{"language": string(projectstate.CodeLanguagePython)}),
				},
			},
			SectionVariantMap: map[string]string{
				"section-main": "variant-main",
			},
			Sections: map[string]projectstate.Section{
				"section-main": {
					ID:               "section-main",
					Name:             "Main",
					VariantIDs:       []string{"variant-main"},
					DefaultVariantID: "variant-main",
					UnsharedKeys:     []string{"code"},
				},
			},
			SectionVariants: map[string]projectstate.SectionVariant{
				"variant-main": {
					ID:               "variant-main",
					ImplID:           "impl-main",
					NonPresetImplIDs: []string{"impl-main"},
				},
			},
			SectionImpls: map[string]projectstate.SectionImpl{
				"impl-main": {
					ID:   "impl-main",
					Kind: projectstate.SectionKindCode,
					Code: &projectstate.CodeSectionImpl{
						Language: projectstate.CodeLanguagePython,
						Binding: &projectstate.CodeFileBinding{
							Path:       "watch_code_test.py",
							AccessMode: projectstate.CodeFileAccessModeReadWrite,
						},
					},
					Payload: mustAppJSON(t, map[string]any{
						"id":   "impl-main",
						"type": "Code",
						"code": "",
						"codeFileBinding": map[string]any{
							"canonical_path": "watch_code_test.py",
							"access_mode":    "read_write",
						},
						"codeLanguage": "python",
						"children":     []string{},
					}),
				},
			},
		}
		document.DefaultProjectID = "project-alpha"
		setAppWatchCodePluginProjectData(t, &document, "project-alpha", projectstate.WatchCodePluginProjectData{
			Files: []string{"watch_code_test.py"},
		})
		return document, nil
	}); err != nil {
		t.Fatalf("mutate root watch code bound section project: %v", err)
	}
}

func prepareAppLSPFixture(t *testing.T) {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	t.Setenv("SETTA_LSP_COMMAND", appTestWorkerPython(t, repoRoot))
	t.Setenv(
		"SETTA_LSP_ARGS",
		filepath.Join(
			repoRoot,
			"tests",
			"fixtures",
			"lsp",
			"mini_language_server.py",
		),
	)
}

func writeAppGeneratedPythonCodeFixture(t *testing.T, cfg config.Config, projectName string) {
	t.Helper()

	codePath := filepath.Join(
		cfg.Paths.SettaFilesRoot,
		filepath.FromSlash(projectstate.GeneratedPythonCodeRelativePath(projectName)),
	)
	if err := os.MkdirAll(filepath.Dir(codePath), 0o755); err != nil {
		t.Fatalf("mkdir generated python code dir: %v", err)
	}
	if err := os.WriteFile(codePath, []byte("class SettaState:\n    pass\n"), 0o644); err != nil {
		t.Fatalf("write generated python code fixture: %v", err)
	}
}

func prepareAppFirstPartyBasedpyrightPlugin(t *testing.T, cfg config.Config) {
	t.Helper()

	t.Setenv("SETTA_PYTHON", firstpartyplugin.BasedpyrightPython(t))
	installAppRepoPlugin(t, cfg, "setta-basedpyright")
}

func prepareAppPluginLanguageServerFixture(t *testing.T) {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	t.Setenv("SETTA_PLUGIN_FIXTURE_PYTHON", appTestWorkerPython(t, repoRoot))
	t.Setenv(
		"SETTA_PLUGIN_FIXTURE_LSP_SCRIPT",
		filepath.Join(
			repoRoot,
			"tests",
			"fixtures",
			"lsp",
			"mini_language_server.py",
		),
	)
}

func installAppLanguageServerOnlyFixturePlugin(t *testing.T, cfg config.Config) {
	t.Helper()

	installAppPluginFixture(t, cfg, "backend", "setta-fixture-backend")
	rewriteAppPluginManifest(t, filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", "setta-fixture-backend"), func(payload map[string]any) {
		payload["capabilities"] = []string{"registerLanguageServer"}
	})
}

func installAppWatchCodeProviderFixture(t *testing.T, cfg config.Config) {
	t.Helper()

	installAppWatchCodeProviderFixtureWithRouteSuffixes(t, cfg, watchcodecontracts.BackendRouteSuffixes())
}

func installAppWatchCodeProviderFixtureWithRouteSuffixes(t *testing.T, cfg config.Config, suffixes []string) string {
	t.Helper()

	installAppPluginFixture(t, cfg, "backend", "setta-fixture-backend")
	pluginRoot := filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", "setta-fixture-backend")
	writeAppFixtureWatchCodeBackendRoutes(t, pluginRoot, suffixes)
	writeAppFixtureWatchCodeBackendUISettings(t, pluginRoot)
	rewriteAppPluginManifest(t, pluginRoot, func(payload map[string]any) {
		enableAppPluginManifestWatchCodeProvider(payload)
	})
	return pluginRoot
}

func enableAppPluginManifestWatchCodeProvider(payload map[string]any) {
	ensureAppPluginManifestCapability(payload, "registerWatchCodeBackend")
	ensureAppPluginManifestCapability(payload, "registerRouter")
	featureCapabilities, ok := payload["featureCapabilities"].(map[string]any)
	if !ok {
		featureCapabilities = map[string]any{}
		payload["featureCapabilities"] = featureCapabilities
	}
	featureCapabilities["watchCode"] = map[string]any{}
}

func writeAppFixtureWatchCodeBackendRoutes(
	t *testing.T,
	pluginRoot string,
	suffixes []string,
) {
	t.Helper()

	backendPath := filepath.Join(pluginRoot, "backend", "main.go")
	content, err := os.ReadFile(backendPath)
	if err != nil {
		t.Fatalf("read backend fixture source: %v", err)
	}
	routeEntries := make([]string, 0, len(suffixes))
	for _, suffix := range suffixes {
		routeEntries = append(routeEntries, fmt.Sprintf(
			"{\"path\": %q, \"methods\": []string{\"POST\"}}",
			watchcodecontracts.BackendRoutePath(testAppWatchCodeProviderPluginID, suffix),
		))
	}
	const marker = `"routes": []map[string]any{`
	if len(routeEntries) == 0 {
		if !strings.Contains(string(content), marker) {
			t.Fatalf("failed to find backend routes marker in %s", backendPath)
		}
		return
	}
	replacement := marker
	replacement += "\n\t\t\t\t" + strings.Join(routeEntries, ",\n\t\t\t\t") + ","
	next := strings.Replace(string(content), marker, replacement, 1)
	if next == string(content) {
		t.Fatalf("failed to insert Watch Code backend routes into %s", backendPath)
	}
	if err := os.WriteFile(backendPath, []byte(next), 0o644); err != nil {
		t.Fatalf("write backend fixture source: %v", err)
	}
}

func writeAppFixtureWatchCodeBackendUISettings(t *testing.T, pluginRoot string) {
	t.Helper()

	backendPath := filepath.Join(pluginRoot, "backend", "main.go")
	content, err := os.ReadFile(backendPath)
	if err != nil {
		t.Fatalf("read backend fixture source: %v", err)
	}
	const marker = `"staticDirs": []map[string]any{`
	uiSettings := fmt.Sprintf(`"uiSettings": []map[string]any{
				{
					"id":             %q,
					"title":          "Watch Code Folders",
					"description":    "List of folders watched by Watch Code.",
					"synonyms":       []string{"watch folders", "watch code folders"},
					"revealKey":      "watch-code-settings",
					"mutability":     "writable",
					"valueSchema":    map[string]any{"type": "array"},
					"readHandlerId":  %q,
					"writeHandlerId": %q,
				},
				{
					"id":             %q,
					"title":          "Watch Code Files",
					"description":    "List of explicit files watched by Watch Code.",
					"synonyms":       []string{"watch files", "watch code files"},
					"revealKey":      "watch-code-settings",
					"mutability":     "writable",
					"valueSchema":    map[string]any{"type": "array"},
					"readHandlerId":  %q,
					"writeHandlerId": %q,
				},
			},
			`,
		watchcodecontracts.BackendLocalSettingIDFolders,
		watchcodecontracts.BackendReadHandlerIDFolders,
		watchcodecontracts.BackendWriteHandlerIDFolders,
		watchcodecontracts.BackendLocalSettingIDFiles,
		watchcodecontracts.BackendReadHandlerIDFiles,
		watchcodecontracts.BackendWriteHandlerIDFiles,
	)
	replacement := uiSettings + marker
	next := strings.Replace(string(content), marker, replacement, 1)
	if next == string(content) {
		t.Fatalf("failed to insert Watch Code backend UI settings into %s", backendPath)
	}
	if err := os.WriteFile(backendPath, []byte(next), 0o644); err != nil {
		t.Fatalf("write backend fixture source: %v", err)
	}
}

func ensureAppPluginManifestCapability(payload map[string]any, capability string) {
	capabilities := map[string]struct{}{}
	switch values := payload["capabilities"].(type) {
	case []any:
		for _, value := range values {
			capability, ok := value.(string)
			if !ok {
				continue
			}
			capabilities[capability] = struct{}{}
		}
	case []string:
		for _, capability := range values {
			capabilities[capability] = struct{}{}
		}
	}
	capabilities[capability] = struct{}{}

	next := make([]string, 0, len(capabilities))
	for capability := range capabilities {
		next = append(next, capability)
	}
	slices.Sort(next)
	payload["capabilities"] = next
}

func prepareAppCurrentSession(t *testing.T, cfg config.Config) {
	t.Helper()

	sessionID := "abc123"
	t.Setenv("SETTA_SESSION_ID", sessionID)

	sessionDir := filepath.Join(cfg.Paths.RuntimeRoot, "sessions", sessionID)
	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		t.Fatalf("mkdir session dir: %v", err)
	}

	secretPath := filepath.Join(sessionDir, "secret")
	if err := os.WriteFile(secretPath, []byte("test-secret"), 0o600); err != nil {
		t.Fatalf("write session secret: %v", err)
	}

	metadata := auth.SessionMetadata{
		ID:                     sessionID,
		WorkspacePath:          cfg.Paths.WorkspaceRoot,
		WorkspacePathCanonical: cfg.Paths.WorkspaceRoot,
		Host:                   "127.0.0.1",
		Port:                   61234,
		PID:                    os.Getpid(),
		StartedAt:              time.Unix(1_700_000_000, 0).UTC(),
		SecretPath:             secretPath,
		RuntimeRoot:            cfg.Paths.RuntimeRoot,
		ServerMode:             string(cfg.Server.Mode),
	}
	metadataBytes, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		t.Fatalf("marshal session metadata: %v", err)
	}
	metadataBytes = append(metadataBytes, '\n')
	if err := os.WriteFile(filepath.Join(sessionDir, "session.json"), metadataBytes, 0o644); err != nil {
		t.Fatalf("write session metadata: %v", err)
	}
}

func buildAppBinaryUploadBody(t *testing.T, payload []byte, durable string) (*bytes.Buffer, string) {
	t.Helper()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	fileWriter, err := writer.CreateFormFile("file", "snapshot.png")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := fileWriter.Write(payload); err != nil {
		t.Fatalf("write form file: %v", err)
	}
	if err := writer.WriteField("durable", durable); err != nil {
		t.Fatalf("write durable field: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}

	return body, writer.FormDataContentType()
}

func mustAppJSON(t *testing.T, value any) json.RawMessage {
	t.Helper()

	payload, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal app test json: %v", err)
	}
	return payload
}

func quietAppTestCatCommand(t *testing.T) []string {
	t.Helper()

	shell := requireAppTestCommand(t, "sh")
	return []string{shell, "-c", "stty -echo; cat"}
}

func interactiveAppTestBashCommand(t *testing.T) []string {
	t.Helper()

	bash := requireAppTestCommand(t, "bash")
	return []string{bash, "--noprofile", "--norc", "-i"}
}

func attachAppTestTerminal(t *testing.T, service *terminals.Service, sessionID string) *terminals.Attachment {
	t.Helper()

	attachment, err := service.Attach(sessionID)
	if err != nil {
		t.Fatalf("attach terminal %q: %v", sessionID, err)
	}
	t.Cleanup(attachment.Close)
	return attachment
}

func prepareAppInterruptShell(t *testing.T, service *terminals.Service, sessionID string, attachment *terminals.Attachment) {
	t.Helper()

	if err := service.Write(sessionID, []byte("set -m\nstty -echo\nprintf 'READY\\n'\n")); err != nil {
		t.Fatalf("prepare interactive shell: %v", err)
	}
	output := waitForAppTestOutputContains(t, service, sessionID, attachment, "READY")
	if !strings.Contains(output, "READY") {
		t.Fatalf("expected shell readiness output, got %q", output)
	}
}

func writeAppInterruptibleScript(t *testing.T) string {
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

func startAppInterruptibleForegroundJob(t *testing.T, service *terminals.Service, sessionID string, attachment *terminals.Attachment, scriptPath string) {
	t.Helper()

	command := "sh " + shellSingleQuoteApp(scriptPath) + "; printf 'CHILD_EXIT:%s\\n' \"$?\"\n"
	if err := service.Write(sessionID, []byte(command)); err != nil {
		t.Fatalf("start foreground job: %v", err)
	}
	output := waitForAppTestOutputContains(t, service, sessionID, attachment, "CHILD_RUNNING")
	if !strings.Contains(output, "CHILD_RUNNING") {
		t.Fatalf("expected child process to start, got %q", output)
	}
}

func waitForAppTestOutputContains(t *testing.T, service *terminals.Service, sessionID string, attachment *terminals.Attachment, needle string) string {
	t.Helper()

	buffer := strings.Builder{}
	buffer.Write(attachment.History)
	if strings.Contains(buffer.String(), needle) {
		return buffer.String()
	}

	readHistory := func() string {
		history, err := service.History(sessionID)
		if err == nil && history != "" {
			return history
		}
		return buffer.String()
	}

	timeout := time.NewTimer(5 * time.Second)
	defer timeout.Stop()

	for {
		select {
		case chunk, ok := <-attachment.Output:
			if !ok {
				history := readHistory()
				if strings.Contains(history, needle) {
					return history
				}
				t.Fatalf("attachment output closed before %q appeared; collected output: %q", needle, history)
			}
			buffer.Write(chunk)
			if strings.Contains(buffer.String(), needle) {
				return buffer.String()
			}
		case <-timeout.C:
			history := readHistory()
			if strings.Contains(history, needle) {
				return history
			}
			t.Fatalf("timed out waiting for %q; collected output: %q", needle, history)
		}
	}
}

func shellSingleQuoteApp(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}

func requireAppTestCommand(t *testing.T, name string) string {
	t.Helper()

	path, err := exec.LookPath(name)
	if err != nil {
		t.Skipf("required command %q not available: %v", name, err)
	}
	return path
}

func installAppPluginFixture(t *testing.T, cfg config.Config, fixtureName string, pluginID string) {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", fixtureName)
	targetRoot := filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", pluginID)
	copyAppTestDir(t, sourceRoot, targetRoot)
}

func installAppRepoPlugin(t *testing.T, cfg config.Config, pluginID string) {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "plugins", pluginID)
	targetRoot := filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", pluginID)
	copyAppTestDir(t, sourceRoot, targetRoot)
	materializeAppRuntimeManagedPluginFrontendAssets(t, targetRoot)
}

func materializeAppRuntimeManagedPluginFrontendAssets(t *testing.T, pluginRoot string) {
	t.Helper()

	if err := plugins.EnsureRuntimeManagedPluginFrontendAssetsForRoot(pluginRoot); err != nil {
		t.Fatalf("materialize runtime-managed plugin frontend assets for %s: %v", pluginRoot, err)
	}
}

func selectAppLanguageServer(t *testing.T, app *App, language string, pluginID string) {
	t.Helper()

	setAppLanguageServerSelectionWithoutRefresh(t, app, language, pluginID)
	if _, err := app.pluginRuntime.Refresh(context.Background()); err != nil {
		t.Fatalf("refresh plugin runtime after selection change: %v", err)
	}
}

func setAppLanguageServerSelectionWithoutRefresh(t *testing.T, app *App, language string, pluginID string) {
	t.Helper()

	selections := map[string]string{}
	if current, err := settingsstate.LanguageServerSelectedByLanguage(app.SettingsState().Snapshot().Document); err == nil {
		for currentLanguage, currentPluginID := range current {
			if currentPluginID == nil {
				continue
			}
			selections[currentLanguage] = *currentPluginID
		}
	}
	selections[language] = pluginID
	replaceAppLanguageServerSelectionsWithoutRefresh(t, app, selections)
}

func replaceAppLanguageServerSelectionsWithoutRefresh(t *testing.T, app *App, selections map[string]string) {
	t.Helper()

	if _, err := app.SettingsState().MutateAndSave(context.Background(), func(document settingsstate.Document) (settingsstate.Document, error) {
		languageServerSettings := document["languageServer"].(map[string]any)
		selectedByLanguage := make(map[string]any, len(selections))
		for language, pluginID := range selections {
			selectedByLanguage[language] = pluginID
		}
		languageServerSettings["selectedByLanguage"] = selectedByLanguage
		return document, nil
	}); err != nil {
		t.Fatalf("save language server selection: %v", err)
	}
}

func rewriteAppPluginManifest(t *testing.T, pluginRoot string, mutate func(map[string]any)) {
	t.Helper()

	manifestPath := filepath.Join(pluginRoot, "setta.plugin.json")
	payload, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("read plugin manifest %s: %v", manifestPath, err)
	}

	var manifest map[string]any
	if err := json.Unmarshal(payload, &manifest); err != nil {
		t.Fatalf("decode plugin manifest %s: %v", manifestPath, err)
	}
	mutate(manifest)

	encoded, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatalf("encode plugin manifest %s: %v", manifestPath, err)
	}
	encoded = append(encoded, '\n')
	if err := os.WriteFile(manifestPath, encoded, 0o644); err != nil {
		t.Fatalf("write plugin manifest %s: %v", manifestPath, err)
	}
}

func linkAppBackendCodegenFixture(t *testing.T, serverURL string, authCookie *http.Cookie) {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", "backend")
	localPluginRoot := filepath.Join(t.TempDir(), "backend")
	copyAppTestDir(t, sourceRoot, localPluginRoot)
	rewriteAppPluginManifest(t, localPluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerCodegenTarget"}
	})

	requestBody := mustAppJSON(t, map[string]any{
		"localPluginRoot": localPluginRoot,
		"scope":           "workspace",
		"enable":          true,
		"force":           true,
	})
	request, err := http.NewRequest(http.MethodPost, serverURL+"/api"+httpapi.RoutePluginsLink, bytes.NewReader(requestBody))
	if err != nil {
		t.Fatalf("new plugins link request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post plugins link: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected plugins link 200, got %d with body %q", response.StatusCode, string(body))
	}
}

type appCompletionItem struct {
	Label string `json:"label"`
}

func requestAppCodeAreaCompletion(
	t *testing.T,
	serverURL string,
	authCookie *http.Cookie,
	projectID string,
	sectionID string,
	fullText string,
	position int,
) []appCompletionItem {
	t.Helper()

	requestBody := mustAppJSON(t, map[string]any{
		"projectConfigId": projectID,
		"sectionId":       sectionID,
		"fullText":        fullText,
		"position":        position,
	})
	request, err := http.NewRequest(http.MethodPost, serverURL+"/api"+httpapi.RouteCodeAreaCompletion, bytes.NewReader(requestBody))
	if err != nil {
		t.Fatalf("new code area completion request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post code area completion: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("expected code area completion 200, got %d with body %q", response.StatusCode, string(payload))
	}

	var payload []appCompletionItem
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode code area completion payload: %v", err)
	}
	return payload
}

func appTestRepoRoot(t *testing.T) string {
	t.Helper()

	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve app test file")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", ".."))
}

func appTestWorkerPython(t *testing.T, repoRoot string) string {
	t.Helper()

	candidates := []string{
		filepath.Join(repoRoot, ".venv", "bin", "python"),
		filepath.Join(repoRoot, ".venv", "bin", "python3"),
	}
	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}

	t.Fatalf("python interpreter not found under %s/.venv", repoRoot)
	return ""
}

func copyAppTestDir(t *testing.T, sourceRoot string, targetRoot string) {
	t.Helper()

	entries, err := os.ReadDir(sourceRoot)
	if err != nil {
		t.Fatalf("read fixture directory %s: %v", sourceRoot, err)
	}
	if err := os.MkdirAll(targetRoot, 0o755); err != nil {
		t.Fatalf("mkdir fixture target %s: %v", targetRoot, err)
	}

	for _, entry := range entries {
		if entry.Name() == "node_modules" {
			continue
		}
		sourcePath := filepath.Join(sourceRoot, entry.Name())
		targetPath := filepath.Join(targetRoot, entry.Name())

		if entry.IsDir() {
			copyAppTestDir(t, sourcePath, targetPath)
			continue
		}

		info, err := entry.Info()
		if err != nil {
			t.Fatalf("stat fixture entry %s: %v", sourcePath, err)
		}
		payload, err := os.ReadFile(sourcePath)
		if err != nil {
			t.Fatalf("read fixture file %s: %v", sourcePath, err)
		}
		if err := os.WriteFile(targetPath, payload, info.Mode().Perm()); err != nil {
			t.Fatalf("write fixture file %s: %v", targetPath, err)
		}
	}
}

func skipIfAppTerminalPTYUnsupported(t *testing.T) {
	t.Helper()

	if runtime.GOOS == "windows" {
		t.Skip("PTY integration tests currently target macOS and Linux")
	}
}
