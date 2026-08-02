package mcpx

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"setta/internal/agentprofiles"
	"setta/internal/externalagentconfigs"
	"setta/internal/llmconfig"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/prompttemplates"
	"setta/internal/realtime"
	"setta/internal/tools"
	"setta/internal/uisettings"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

type uiSettingDriftProjectState struct {
	*projectstate.Runtime
}

type expectedOldValueRecordingProjectState struct {
	*projectstate.Runtime
	observedShowParamExpectedOldValues []*bool
}

type concurrentCoreSettingProjectState struct {
	*projectstate.Runtime
	beforeCompareProjectName          func(context.Context, string, string, *string) error
	beforeComparePythonCodegenEnabled func(context.Context, string, bool, *bool) error
}

type concurrentWritePluginMutationService struct {
	*plugins.Service
	beforeWriteConfig func(context.Context, plugins.ConfigWriteOptions) error
}

func (s *concurrentWritePluginMutationService) WriteConfig(ctx context.Context, options plugins.ConfigWriteOptions) (plugins.PluginConfigWriteResponse, error) {
	if s.beforeWriteConfig != nil {
		hook := s.beforeWriteConfig
		s.beforeWriteConfig = nil
		if err := hook(ctx, options); err != nil {
			return plugins.PluginConfigWriteResponse{}, err
		}
	}
	return s.Service.WriteConfig(ctx, options)
}

type runtimeOverridePluginMutationService struct {
	*plugins.Service
	mutateRuntime func(plugins.PluginRuntimeResponse) plugins.PluginRuntimeResponse
}

func (s *runtimeOverridePluginMutationService) Runtime(options plugins.RuntimeOptions) (plugins.PluginRuntimeResponse, error) {
	response, err := s.Service.Runtime(options)
	if err != nil {
		return plugins.PluginRuntimeResponse{}, err
	}
	if s.mutateRuntime != nil {
		response = s.mutateRuntime(response)
	}
	return response, nil
}

type watchCodeBackendUISettingPluginMutationProvider struct {
	runtime       *projectstate.Runtime
	workspaceRoot string
	pluginID      string
}

func newScopedTestServerSessionWithBackendWatchCodeSettings(
	t *testing.T,
	workspaceRoot string,
	projectRuntime *projectstate.Runtime,
) (*Server, *sdkmcp.ClientSession) {
	t.Helper()
	return newScopedTestServerSessionWithBackendWatchCodeSettingsAndOptions(
		t,
		workspaceRoot,
		projectRuntime,
		ServerOptions{},
	)
}

func newScopedTestServerSessionWithBackendWatchCodeSettingsAndOptions(
	t *testing.T,
	workspaceRoot string,
	projectRuntime *projectstate.Runtime,
	options ServerOptions,
) (*Server, *sdkmcp.ClientSession) {
	t.Helper()
	if strings.TrimSpace(workspaceRoot) == "" {
		workspaceRoot = t.TempDir()
	}
	options.PluginMutations = &watchCodeBackendUISettingPluginMutationProvider{
		runtime:       projectRuntime,
		workspaceRoot: workspaceRoot,
		pluginID:      activeScopedTestWatchCodeProviderID,
	}
	return newScopedTestServerSessionWithOptions(t, workspaceRoot, projectRuntime, options)
}

func (p *watchCodeBackendUISettingPluginMutationProvider) Runtime(plugins.RuntimeOptions) (plugins.PluginRuntimeResponse, error) {
	capabilities := []string{"registerUISettings"}
	return plugins.PluginRuntimeResponse{
		List: plugins.PluginListResponse{
			Plugins: []plugins.PluginListEntry{
				{
					PluginID:              p.pluginID,
					Name:                  "Watch Code Backend UI Settings",
					EffectiveCapabilities: capabilities,
				},
			},
		},
		Status: plugins.PluginStatusResponse{
			Plugins: []plugins.PluginStatusEntry{
				{
					PluginID:              p.pluginID,
					State:                 plugins.PluginRuntimeStateActive,
					EffectiveCapabilities: capabilities,
				},
			},
		},
	}, nil
}

func (p *watchCodeBackendUISettingPluginMutationProvider) Rescan() (plugins.DiscoverySnapshot, error) {
	return plugins.DiscoverySnapshot{}, nil
}

func (p *watchCodeBackendUISettingPluginMutationProvider) Install(context.Context, plugins.InstallOptions) (plugins.PluginInstallResponse, error) {
	return plugins.PluginInstallResponse{}, fmt.Errorf("plugin install is unavailable in this test provider")
}

func (p *watchCodeBackendUISettingPluginMutationProvider) Uninstall(context.Context, plugins.UninstallOptions) (plugins.PluginUninstallResponse, error) {
	return plugins.PluginUninstallResponse{}, fmt.Errorf("plugin uninstall is unavailable in this test provider")
}

func (p *watchCodeBackendUISettingPluginMutationProvider) Update(context.Context, plugins.UpdateOptions) (plugins.PluginUpdateResponse, error) {
	return plugins.PluginUpdateResponse{}, fmt.Errorf("plugin update is unavailable in this test provider")
}

func (p *watchCodeBackendUISettingPluginMutationProvider) Rollback(context.Context, plugins.RollbackOptions) (plugins.PluginRollbackResponse, error) {
	return plugins.PluginRollbackResponse{}, fmt.Errorf("plugin rollback is unavailable in this test provider")
}

func (p *watchCodeBackendUISettingPluginMutationProvider) WriteConfig(context.Context, plugins.ConfigWriteOptions) (plugins.PluginConfigWriteResponse, error) {
	return plugins.PluginConfigWriteResponse{}, fmt.Errorf("plugin config writes are unavailable in this test provider")
}

func (p *watchCodeBackendUISettingPluginMutationProvider) GetBackendUISettings(pluginID string) ([]plugins.PluginRegisteredUISetting, error) {
	if strings.TrimSpace(pluginID) != p.pluginID {
		return nil, fmt.Errorf("plugin %q is not active", pluginID)
	}
	return watchCodeBackendUISettingRegistrations(p.pluginID), nil
}

func (p *watchCodeBackendUISettingPluginMutationProvider) ReadBackendUISettingValue(_ context.Context, options plugins.BackendUISettingReadOptions) (any, error) {
	projectData, err := p.watchCodeProjectData(options.PluginID, options.ProjectConfigID)
	if err != nil {
		return nil, err
	}
	switch strings.TrimSpace(options.HandlerID) {
	case "read_folders":
		return watchCodeFoldersToPluginSettingValue(projectData.Folders), nil
	case "read_files":
		return append([]string{}, projectData.Files...), nil
	default:
		return nil, fmt.Errorf("unsupported watch code read handler %q", options.HandlerID)
	}
}

func (p *watchCodeBackendUISettingPluginMutationProvider) WriteBackendUISettingValue(ctx context.Context, options plugins.BackendUISettingWriteOptions) error {
	if strings.TrimSpace(options.PluginID) != p.pluginID {
		return fmt.Errorf("plugin %q is not active", options.PluginID)
	}
	switch strings.TrimSpace(options.HandlerID) {
	case "write_folders":
		folders, err := decodeWatchCodeBackendUISettingValue[[]projectstate.WatchCodeFolder](options.Value)
		if err != nil {
			return err
		}
		projectData, err := p.watchCodeProjectData(options.PluginID, options.ProjectConfigID)
		if err != nil {
			return err
		}
		_, err = p.runtime.SetWatchCodeInputs(
			ctx,
			p.pluginID,
			options.ProjectConfigID,
			folders,
			projectData.Files,
			p.workspaceRoot,
		)
		return err
	case "write_files":
		files, err := decodeWatchCodeBackendUISettingValue[[]string](options.Value)
		if err != nil {
			return err
		}
		projectData, err := p.watchCodeProjectData(options.PluginID, options.ProjectConfigID)
		if err != nil {
			return err
		}
		_, err = p.runtime.SetWatchCodeInputs(
			ctx,
			p.pluginID,
			options.ProjectConfigID,
			projectData.Folders,
			files,
			p.workspaceRoot,
		)
		return err
	default:
		return fmt.Errorf("unsupported watch code write handler %q", options.HandlerID)
	}
}

func (p *watchCodeBackendUISettingPluginMutationProvider) watchCodeProjectData(
	pluginID string,
	projectConfigID string,
) (projectstate.WatchCodePluginProjectData, error) {
	if strings.TrimSpace(pluginID) != p.pluginID {
		return projectstate.WatchCodePluginProjectData{}, fmt.Errorf("plugin %q is not active", pluginID)
	}
	document := p.runtime.Snapshot().Document
	project, err := document.ProjectByID(projectConfigID)
	if err != nil {
		return projectstate.WatchCodePluginProjectData{}, err
	}
	projectData, _, err := document.WatchCodePluginProjectData(p.pluginID, project.ID)
	return projectData, err
}

func watchCodeBackendUISettingRegistrations(pluginID string) []plugins.PluginRegisteredUISetting {
	foldersWriteHandlerID := "write_folders"
	filesWriteHandlerID := "write_files"
	return []plugins.PluginRegisteredUISetting{
		{
			PluginID:       pluginID,
			LocalSettingID: "folders",
			Title:          "Watch Code Folders",
			Description:    "List of folders watched by Watch Code.",
			Synonyms:       []string{"watch folders", "watch code folders"},
			PaneID:         "left",
			RevealKey:      "watch-code-settings",
			Mutability:     string(uisettings.MutabilityWritable),
			ValueSchema: map[string]any{
				"type": "array",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"path":      map[string]any{"type": "string"},
						"recursive": map[string]any{"type": "boolean"},
					},
					"required":             []any{"path"},
					"additionalProperties": false,
				},
			},
			ReadHandlerID:  "read_folders",
			WriteHandlerID: &foldersWriteHandlerID,
		},
		{
			PluginID:       pluginID,
			LocalSettingID: "files",
			Title:          "Watch Code Files",
			Description:    "List of explicit files watched by Watch Code.",
			Synonyms:       []string{"watch files", "watch code files"},
			PaneID:         "left",
			RevealKey:      "watch-code-settings",
			Mutability:     string(uisettings.MutabilityWritable),
			ValueSchema: map[string]any{
				"type":  "array",
				"items": map[string]any{"type": "string"},
			},
			ReadHandlerID:  "read_files",
			WriteHandlerID: &filesWriteHandlerID,
		},
	}
}

func watchCodeFoldersToPluginSettingValue(folders []projectstate.WatchCodeFolder) []map[string]any {
	if len(folders) == 0 {
		return []map[string]any{}
	}
	values := make([]map[string]any, len(folders))
	for index, folder := range folders {
		values[index] = map[string]any{
			"path":      folder.Path,
			"recursive": folder.Recursive,
		}
	}
	return values
}

func decodeWatchCodeBackendUISettingValue[T any](value any) (T, error) {
	var decoded T
	encoded, err := json.Marshal(value)
	if err != nil {
		return decoded, err
	}
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		return decoded, err
	}
	return decoded, nil
}

type recordingRevealService struct {
	input  uisettings.RevealInput
	result uisettings.RevealResult
	err    error
}

type stubUISettingRevealTransport struct {
	registry *realtime.Registry
	sendJSON func(context.Context, any, string) (bool, error)
}

func (s *stubUISettingRevealTransport) Registry() *realtime.Registry {
	return s.registry
}

func (s *stubUISettingRevealTransport) SendJSON(ctx context.Context, message any, connectionID string) (bool, error) {
	if s.sendJSON != nil {
		return s.sendJSON(ctx, message, connectionID)
	}
	return true, nil
}

func setUISettingAgenticContext(
	t *testing.T,
	clientSession *sdkmcp.ClientSession,
	projectConfigID string,
	chatID string,
	sectionID string,
	allowUnscoped bool,
) {
	t.Helper()

	arguments := map[string]any{
		"projectConfigId": projectConfigID,
	}
	if allowUnscoped {
		arguments["allowUnscoped"] = true
	} else {
		arguments["chatId"] = chatID
		arguments["sectionId"] = sectionID
	}
	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "set_agentic_context",
		Arguments: arguments,
	})
	if err != nil {
		t.Fatalf("call set_agentic_context: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", result.StructuredContent)
	}
}

func setUISettingAgenticContextWithShareSession(
	t *testing.T,
	clientSession *sdkmcp.ClientSession,
	projectConfigID string,
	chatID string,
	sectionID string,
	shareSessionID string,
	allowUnscoped bool,
) {
	t.Helper()

	arguments := map[string]any{
		"projectConfigId": projectConfigID,
		"shareSessionId":  shareSessionID,
	}
	if allowUnscoped {
		arguments["allowUnscoped"] = true
	} else {
		arguments["chatId"] = chatID
		arguments["sectionId"] = sectionID
	}
	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "set_agentic_context",
		Arguments: arguments,
	})
	if err != nil {
		t.Fatalf("call set_agentic_context: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", result.StructuredContent)
	}
}

func setUISettingAgenticContextWithShareSessionAndFrontendAffinity(
	t *testing.T,
	clientSession *sdkmcp.ClientSession,
	projectConfigID string,
	chatID string,
	sectionID string,
	shareSessionID string,
	frontendAffinityToken string,
	allowUnscoped bool,
) {
	t.Helper()

	arguments := map[string]any{
		"projectConfigId":       projectConfigID,
		"shareSessionId":        shareSessionID,
		"frontendAffinityToken": frontendAffinityToken,
	}
	if allowUnscoped {
		arguments["allowUnscoped"] = true
	} else {
		arguments["chatId"] = chatID
		arguments["sectionId"] = sectionID
	}
	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "set_agentic_context",
		Arguments: arguments,
	})
	if err != nil {
		t.Fatalf("call set_agentic_context: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", result.StructuredContent)
	}
}

func mustCloneScopedTestProject(t *testing.T, runtime *projectstate.Runtime, projectID string, sourceProjectID string) {
	t.Helper()

	_, err := runtime.MutateAndSave(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		source, err := document.ProjectByID(sourceProjectID)
		if err != nil {
			return document, err
		}
		cloned := source
		cloned.ID = projectID
		cloned.Name = fmt.Sprintf("%s clone", source.Name)
		document.Projects[projectID] = cloned
		return document, nil
	})
	if err != nil {
		t.Fatalf("clone scoped test project %q from %q: %v", projectID, sourceProjectID, err)
	}
}

func (s uiSettingDriftProjectState) CompareAndSetShowParamDisplayNames(
	ctx context.Context,
	projectID string,
	show bool,
	expectedOldValue *bool,
) (projectstate.Snapshot, projectstate.CompareAndSetResult[bool], error) {
	snapshot, result, err := s.Runtime.CompareAndSetShowParamDisplayNames(ctx, projectID, show, expectedOldValue)
	if err != nil {
		return snapshot, result, err
	}
	result.OldValue = !result.OldValue
	return snapshot, result, nil
}

func (s *expectedOldValueRecordingProjectState) CompareAndSetShowParamDisplayNames(
	ctx context.Context,
	projectID string,
	show bool,
	expectedOldValue *bool,
) (projectstate.Snapshot, projectstate.CompareAndSetResult[bool], error) {
	if expectedOldValue == nil {
		s.observedShowParamExpectedOldValues = append(s.observedShowParamExpectedOldValues, nil)
	} else {
		recorded := *expectedOldValue
		s.observedShowParamExpectedOldValues = append(s.observedShowParamExpectedOldValues, &recorded)
	}
	return s.Runtime.CompareAndSetShowParamDisplayNames(ctx, projectID, show, expectedOldValue)
}

func (s *concurrentCoreSettingProjectState) CompareAndSetProjectName(
	ctx context.Context,
	projectID string,
	name string,
	expectedOldValue *string,
) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error) {
	if s.beforeCompareProjectName != nil {
		hook := s.beforeCompareProjectName
		s.beforeCompareProjectName = nil
		if err := hook(ctx, projectID, name, expectedOldValue); err != nil {
			return projectstate.Snapshot{}, projectstate.CompareAndSetResult[string]{}, err
		}
	}
	return s.Runtime.CompareAndSetProjectName(ctx, projectID, name, expectedOldValue)
}

func (s *concurrentCoreSettingProjectState) CompareAndSetPythonCodegenEnabled(
	ctx context.Context,
	projectID string,
	enabled bool,
	expectedOldValue *bool,
	validator projectstate.CodegenTargetValidator,
	pythonReconciler projectstate.PythonCodegenSectionReconciler,
) (projectstate.Snapshot, projectstate.CompareAndSetResult[bool], error) {
	if s.beforeComparePythonCodegenEnabled != nil {
		hook := s.beforeComparePythonCodegenEnabled
		s.beforeComparePythonCodegenEnabled = nil
		if err := hook(ctx, projectID, enabled, expectedOldValue); err != nil {
			return projectstate.Snapshot{}, projectstate.CompareAndSetResult[bool]{}, err
		}
	}
	return s.Runtime.CompareAndSetPythonCodegenEnabled(
		ctx,
		projectID,
		enabled,
		expectedOldValue,
		validator,
		pythonReconciler,
	)
}

func (s *recordingRevealService) Reveal(_ context.Context, input uisettings.RevealInput) (uisettings.RevealResult, error) {
	s.input = input
	return s.result, s.err
}

func openProjectAISettingLLMService(t *testing.T, root string, apiKeys map[string]string) *llmconfig.Service {
	t.Helper()

	runtime, err := llmconfig.NewRuntime(llmconfig.AllConfigs{})
	if err != nil {
		t.Fatalf("new llm runtime: %v", err)
	}
	service, err := llmconfig.NewService(llmconfig.ServiceOptions{
		ConfigPath:         llmconfig.Path(root),
		ManagedAPIKeysPath: llmconfig.ManagedAPIKeysPath(root),
		Runtime:            runtime,
		ProcessEnv: func() map[string]string {
			return map[string]string{}
		},
	})
	if err != nil {
		t.Fatalf("new llm service: %v", err)
	}
	if _, status := service.SaveManagedAPIKeys(apiKeys, 0); status != llmconfig.ManagedAPIKeysWriteStatusSuccess {
		t.Fatalf("seed managed api keys: %s", status)
	}
	return service
}

func mustStructuredInteger(t *testing.T, value any) int {
	t.Helper()

	switch typed := value.(type) {
	case int:
		return typed
	case float64:
		return int(typed)
	default:
		t.Fatalf("expected integer value, got %#v", value)
		return 0
	}
}

func TestServerUISettingToolsExposeScopedSingletonMetadata(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	toolsResult, err := clientSession.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}

	expected := map[string]tools.AccessType{
		"search_ui_settings":   tools.AccessTypeRead,
		"get_ui_setting_value": tools.AccessTypeRead,
		"reveal_ui_setting":    tools.AccessTypeRead,
		"set_ui_setting_value": tools.AccessTypeWrite,
	}
	for _, tool := range toolsResult.Tools {
		accessType, ok := expected[tool.Name]
		if !ok {
			continue
		}
		meta := mustStructuredMap(t, tool.Meta[toolMetaNamespace])
		if meta["accessType"] != string(accessType) {
			t.Fatalf("expected %s access type for %s, got %#v", accessType, tool.Name, meta["accessType"])
		}
		if meta["defaultTargetSingletonSection"] != "GlobalVariables" {
			t.Fatalf("expected GlobalVariables singleton target for %s, got %#v", tool.Name, meta["defaultTargetSingletonSection"])
		}
		if tool.Name == "set_ui_setting_value" {
			inputSchema := mustStructuredMap(t, tool.InputSchema)
			inputProperties := mustStructuredMap(t, inputSchema["properties"])
			if _, ok := inputProperties["expectedOldValue"]; !ok {
				t.Fatalf("expected set_ui_setting_value schema to expose expectedOldValue, got %#v", inputProperties)
			}
		}
	}
}

func TestServerProjectAIUISettingsAreDiscoverableRevealableAndReadOnly(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	projectRuntime := openScopedTestProjectRuntime(t)
	profileStore, templateStore, externalConfigStore, llmService := seedProjectAIUISettingDependencies(t, root)
	expectations := projectAIUISettingExpectations()
	revealService := newProjectAIUISettingRevealService(t, expectations)

	_, clientSession := newScopedTestServerSessionWithOptions(t, root, projectRuntime, ServerOptions{
		WorkspaceRoot:        root,
		ProjectState:         projectRuntime,
		AgentProfiles:        profileStore,
		PromptTemplates:      templateStore,
		ExternalAgentConfigs: externalConfigStore,
		LLMAPIKeys:           llmService,
		UISettingReveals:     revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "", "", true)
	assertProjectAIUISettings(t, clientSession, expectations)
}

type projectAIUISettingExpectation struct {
	query           string
	expectedCount   int
	accordionItemID string
}

func projectAIUISettingExpectations() map[string]projectAIUISettingExpectation {
	return map[string]projectAIUISettingExpectation{
		"core.project_ai_settings.llm_api_keys": {
			query:           "llm api keys",
			expectedCount:   2,
			accordionItemID: "project-ai-settings-llm-api-keys",
		},
		"core.project_ai_settings.agent_profiles": {
			query:           "agent profiles",
			expectedCount:   3,
			accordionItemID: "project-ai-settings-agent-profiles",
		},
		"core.project_ai_settings.prompt_templates": {
			query:           "prompt templates",
			expectedCount:   4,
			accordionItemID: "project-ai-settings-prompt-templates",
		},
		"core.project_ai_settings.external_agents": {
			query:           "external agents",
			expectedCount:   1,
			accordionItemID: "project-ai-settings-external-agents",
		},
	}
}

func seedProjectAIUISettingDependencies(t *testing.T, root string) (*agentprofiles.Store, *prompttemplates.Store, *externalagentconfigs.Store, *llmconfig.Service) {
	t.Helper()

	profileStore, err := agentprofiles.NewStore(root)
	if err != nil {
		t.Fatalf("new agent profile store: %v", err)
	}
	if err := profileStore.Write([]agentprofiles.Profile{
		{ID: "profile-alpha", Name: "Alpha"},
		{ID: "profile-beta", Name: "Beta"},
		{ID: "profile-gamma", Name: "Gamma"},
	}); err != nil {
		t.Fatalf("seed agent profiles: %v", err)
	}

	templateStore, err := prompttemplates.NewStore(root)
	if err != nil {
		t.Fatalf("new prompt template store: %v", err)
	}
	for _, template := range []prompttemplates.Template{
		{ID: "template-alpha", Name: "Alpha", Template: "alpha"},
		{ID: "template-beta", Name: "Beta", Template: "beta"},
		{ID: "template-gamma", Name: "Gamma", Template: "gamma"},
		{ID: "template-delta", Name: "Delta", Template: "delta"},
	} {
		if err := templateStore.Save(template); err != nil {
			t.Fatalf("seed prompt template %s: %v", template.ID, err)
		}
	}

	externalConfigStore, err := externalagentconfigs.NewStore(root)
	if err != nil {
		t.Fatalf("new external agent config store: %v", err)
	}
	if err := externalConfigStore.Write([]externalagentconfigs.Config{
		{
			ID:       "external-codex",
			Name:     "Codex",
			ToolType: externalagentconfigs.ToolTypeCodex,
			RunMode:  externalagentconfigs.RunModeAppServer,
		},
	}); err != nil {
		t.Fatalf("seed external agent configs: %v", err)
	}

	llmService := openProjectAISettingLLMService(t, root, map[string]string{
		"OPENAI_API_KEY":    "openai-secret",
		"ANTHROPIC_API_KEY": "anthropic-secret",
	})
	return profileStore, templateStore, externalConfigStore, llmService
}

func newProjectAIUISettingRevealService(t *testing.T, expectations map[string]projectAIUISettingExpectation) uisettings.RevealService {
	t.Helper()

	registry := realtime.NewRegistry(realtime.RegistryOptions{})
	if _, err := registry.Register(realtime.RegisterParams{ID: "frontend-1", Type: realtime.ConnectionTypeFrontend}); err != nil {
		t.Fatalf("register frontend: %v", err)
	}
	results := realtime.NewUISettingRevealResultHub()
	transport := &stubUISettingRevealTransport{registry: registry}
	transport.sendJSON = func(_ context.Context, message any, connectionID string) (bool, error) {
		assertProjectAIUISettingRevealMessage(t, message, connectionID, expectations, results)
		return true, nil
	}
	revealService, err := uisettings.NewRevealService(uisettings.RevealServiceOptions{
		Transport: transport,
		Results:   results,
	})
	if err != nil {
		t.Fatalf("new reveal service: %v", err)
	}
	return revealService
}

func assertProjectAIUISettingRevealMessage(
	t *testing.T,
	message any,
	connectionID string,
	expectations map[string]projectAIUISettingExpectation,
	results *realtime.UISettingRevealResultHub,
) {
	t.Helper()

	if connectionID != "frontend-1" {
		t.Fatalf("expected reveal dispatch to frontend-1, got %q", connectionID)
	}
	revealMessage, ok := message.(realtime.UISettingRevealMessage)
	if !ok {
		t.Fatalf("expected realtime.UISettingRevealMessage, got %T", message)
	}
	if revealMessage.Content.ActiveSectionID != nil {
		t.Fatalf("expected left-pane project-ai reveal without activeSectionId, got %#v", revealMessage.Content.ActiveSectionID)
	}
	if len(revealMessage.Content.Reveals) != 1 {
		t.Fatalf("expected one reveal target, got %#v", revealMessage.Content.Reveals)
	}
	target := revealMessage.Content.Reveals[0]
	expectation, ok := expectations[target.SettingID]
	if !ok {
		t.Fatalf("unexpected reveal target setting id %q", target.SettingID)
	}
	if target.OverviewTabKey == nil || *target.OverviewTabKey != "ProjectAISettings" {
		t.Fatalf("expected ProjectAISettings overview tab, got %#v", target.OverviewTabKey)
	}
	assertProjectAIUISettingRevealStep(t, target, expectation)
	if !results.Resolve(realtime.UISettingRevealResultContent{
		ProjectConfigID: "project-alpha",
		RequestID:       revealMessage.Content.RequestID,
		Statuses: []realtime.UISettingRevealResultStatus{
			{
				SettingID: target.SettingID,
				Status:    "revealed",
			},
		},
	}, connectionID) {
		t.Fatal("expected reveal result resolution to succeed")
	}
}

func assertProjectAIUISettingRevealStep(t *testing.T, target realtime.UISettingRevealTarget, expectation projectAIUISettingExpectation) {
	t.Helper()

	if len(target.RevealActivationSteps) != 1 {
		t.Fatalf("expected one reveal activation step, got %#v", target.RevealActivationSteps)
	}
	if target.RevealActivationSteps[0].Type != string(uisettings.RevealActivationProjectAIAccordion) {
		t.Fatalf("expected project-ai accordion activation step, got %#v", target.RevealActivationSteps[0])
	}
	if target.RevealActivationSteps[0].ItemValue != expectation.accordionItemID {
		t.Fatalf("expected accordion item %q, got %#v", expectation.accordionItemID, target.RevealActivationSteps[0].ItemValue)
	}
}

func assertProjectAIUISettings(
	t *testing.T,
	clientSession *sdkmcp.ClientSession,
	expectations map[string]projectAIUISettingExpectation,
) {
	t.Helper()

	for settingID, expectation := range expectations {
		assertProjectAIUISettingSearch(t, clientSession, settingID, expectation)
		assertProjectAIUISettingValue(t, clientSession, settingID, expectation)
		assertProjectAIUISettingReadOnlyWrite(t, clientSession, settingID)
		assertProjectAIUISettingReveal(t, clientSession, settingID, expectation)
	}
}

func assertProjectAIUISettingSearch(t *testing.T, clientSession *sdkmcp.ClientSession, settingID string, expectation projectAIUISettingExpectation) {
	t.Helper()

	searchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           expectation.query,
			"sourceFilter":    "core",
		},
	})
	if err != nil {
		t.Fatalf("call search_ui_settings for %s: %v", settingID, err)
	}
	if searchResult.IsError {
		t.Fatalf("expected search_ui_settings success for %s, got %#v", settingID, searchResult.StructuredContent)
	}
	searchPayload := mustStructuredMap(t, searchResult.StructuredContent)
	searchEntries := mustStructuredList(t, searchPayload["results"])
	for _, rawEntry := range searchEntries {
		entry := mustStructuredMap(t, rawEntry)
		if entry["settingId"] == settingID {
			return
		}
	}
	t.Fatalf("expected search results for %s to include %s, got %#v", expectation.query, settingID, searchEntries)
}

func assertProjectAIUISettingValue(t *testing.T, clientSession *sdkmcp.ClientSession, settingID string, expectation projectAIUISettingExpectation) {
	t.Helper()

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       settingID,
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value for %s: %v", settingID, err)
	}
	if getResult.IsError {
		t.Fatalf("expected get_ui_setting_value success for %s, got %#v", settingID, getResult.StructuredContent)
	}
	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	if got := mustStructuredInteger(t, getPayload["value"]); got != expectation.expectedCount {
		t.Fatalf("expected %s count %d, got %d", settingID, expectation.expectedCount, got)
	}
	settingPayload := mustStructuredMap(t, getPayload["setting"])
	if settingPayload["mutability"] != string(uisettings.MutabilityReadOnly) {
		t.Fatalf("expected %s mutability readOnly, got %#v", settingID, settingPayload["mutability"])
	}
	locationPayload := mustStructuredMap(t, settingPayload["location"])
	if locationPayload["overviewTabKey"] != "ProjectAISettings" {
		t.Fatalf("expected %s overviewTabKey ProjectAISettings, got %#v", settingID, locationPayload["overviewTabKey"])
	}
}

func assertProjectAIUISettingReadOnlyWrite(t *testing.T, clientSession *sdkmcp.ClientSession, settingID string) {
	t.Helper()

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       settingID,
			"value":           0,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value for %s: %v", settingID, err)
	}
	if setResult.IsError {
		t.Fatalf("expected structured set_ui_setting_value failure for %s, got %#v", settingID, setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	errorPayload := mustStructuredMap(t, setPayload["error"])
	if errorPayload["code"] != string(uisettings.ErrorCodeSettingReadOnly) {
		t.Fatalf("expected read-only error code for %s, got %#v", settingID, errorPayload["code"])
	}
}

func assertProjectAIUISettingReveal(t *testing.T, clientSession *sdkmcp.ClientSession, settingID string, expectation projectAIUISettingExpectation) {
	t.Helper()

	revealResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       settingID,
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting for %s: %v", settingID, err)
	}
	if revealResult.IsError {
		t.Fatalf("expected reveal_ui_setting success for %s, got %#v", settingID, revealResult.StructuredContent)
	}
	revealPayload := mustStructuredMap(t, revealResult.StructuredContent)
	if got := mustStructuredInteger(t, revealPayload["emittedRevealCount"]); got != 1 {
		t.Fatalf("expected emittedRevealCount=1 for %s, got %d", settingID, got)
	}
	statuses := mustStructuredList(t, revealPayload["statuses"])
	if len(statuses) != 1 {
		t.Fatalf("expected one reveal status for %s, got %#v", settingID, statuses)
	}
	status := mustStructuredMap(t, statuses[0])
	if status["status"] != "revealed" {
		t.Fatalf("expected revealed status for %s, got %#v", settingID, status["status"])
	}
	target := mustStructuredMap(t, status["target"])
	if target["overviewTabKey"] != "ProjectAISettings" {
		t.Fatalf("expected ProjectAISettings reveal target for %s, got %#v", settingID, target["overviewTabKey"])
	}
	assertProjectAIUISettingRevealPayloadStep(t, settingID, target, expectation)
}

func assertProjectAIUISettingRevealPayloadStep(
	t *testing.T,
	settingID string,
	target map[string]any,
	expectation projectAIUISettingExpectation,
) {
	t.Helper()

	steps := mustStructuredList(t, target["revealActivationSteps"])
	if len(steps) != 1 {
		t.Fatalf("expected one reveal activation step for %s, got %#v", settingID, steps)
	}
	step := mustStructuredMap(t, steps[0])
	if step["type"] != string(uisettings.RevealActivationProjectAIAccordion) {
		t.Fatalf("expected project-ai activation step for %s, got %#v", settingID, step["type"])
	}
	if step["itemValue"] != expectation.accordionItemID {
		t.Fatalf("expected activation item %q for %s, got %#v", expectation.accordionItemID, settingID, step["itemValue"])
	}
}
