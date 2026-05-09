package mcpx

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"reflect"
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

	expectations := map[string]struct {
		query           string
		expectedCount   int
		accordionItemID string
	}{
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

	registry := realtime.NewRegistry(realtime.RegistryOptions{})
	if _, err := registry.Register(realtime.RegisterParams{ID: "frontend-1", Type: realtime.ConnectionTypeFrontend}); err != nil {
		t.Fatalf("register frontend: %v", err)
	}
	results := realtime.NewUISettingRevealResultHub()
	transport := &stubUISettingRevealTransport{registry: registry}
	transport.sendJSON = func(_ context.Context, message any, connectionID string) (bool, error) {
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
		if len(target.RevealActivationSteps) != 1 {
			t.Fatalf("expected one reveal activation step, got %#v", target.RevealActivationSteps)
		}
		if target.RevealActivationSteps[0].Type != string(uisettings.RevealActivationProjectAIAccordion) {
			t.Fatalf("expected project-ai accordion activation step, got %#v", target.RevealActivationSteps[0])
		}
		if target.RevealActivationSteps[0].ItemValue != expectation.accordionItemID {
			t.Fatalf("expected accordion item %q, got %#v", expectation.accordionItemID, target.RevealActivationSteps[0].ItemValue)
		}
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
		return true, nil
	}
	revealService, err := uisettings.NewRevealService(uisettings.RevealServiceOptions{
		Transport: transport,
		Results:   results,
	})
	if err != nil {
		t.Fatalf("new reveal service: %v", err)
	}

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

	for settingID, expectation := range expectations {
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
		found := false
		for _, rawEntry := range searchEntries {
			entry := mustStructuredMap(t, rawEntry)
			if entry["settingId"] == settingID {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("expected search results for %s to include %s, got %#v", expectation.query, settingID, searchEntries)
		}

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
}

func TestServerRevealUISettingReturnsStructuredPayload(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:          "request-1",
			ProjectConfigID:    "project-alpha",
			DurationMS:         1500,
			EmittedRevealCount: 1,
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "revealed",
					Target: &realtime.UISettingRevealTarget{
						SettingID:       "core.project.show_param_display_names",
						Side:            "right",
						UIEditorTabName: testStringPointer("QuickInfoConfig"),
						Strategy:        "dom_anchor",
						AnchorID:        testStringPointer("core.project.show_param_display_names"),
					},
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithBackendWatchCodeSettingsAndOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", false)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Arguments: map[string]any{
			"projectConfigId":     "project-alpha",
			"settingId":           "core.project.show_param_display_names",
			"sectionIdToActivate": "allowed-callable-section",
			"durationMs":          1500,
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["requestId"] != "request-1" {
		t.Fatalf("expected requestId=request-1, got %#v", payload["requestId"])
	}
	if payload["emittedRevealCount"] != float64(1) && payload["emittedRevealCount"] != 1 {
		t.Fatalf("expected emittedRevealCount=1, got %#v", payload["emittedRevealCount"])
	}
	statuses := mustStructuredList(t, payload["statuses"])
	if len(statuses) != 1 {
		t.Fatalf("expected one reveal status, got %#v", statuses)
	}
	status := mustStructuredMap(t, statuses[0])
	if status["status"] != "revealed" {
		t.Fatalf("expected revealed status, got %#v", status["status"])
	}

	if revealService.input.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected canonical project id, got %q", revealService.input.ProjectConfigID)
	}
	if revealService.input.SettingID != "core.project.show_param_display_names" {
		t.Fatalf("expected setting id to be forwarded, got %q", revealService.input.SettingID)
	}
	if revealService.input.SectionIDToActivate != "allowed-callable-section" {
		t.Fatalf("expected explicit section id to be forwarded, got %q", revealService.input.SectionIDToActivate)
	}
	if revealService.input.ContextSectionID != "chat-section" {
		t.Fatalf("expected context section id chat-section, got %q", revealService.input.ContextSectionID)
	}
	if revealService.input.ChatID != "chat-1" {
		t.Fatalf("expected chat-1 chat context, got %q", revealService.input.ChatID)
	}
	if revealService.input.ProjectView == nil {
		t.Fatal("expected project view to be forwarded to reveal service")
	}
	if revealService.input.Registry == nil {
		t.Fatal("expected scoped registry to be forwarded to reveal service")
	}
}

func TestServerRevealUISettingFailsClosedWhenRevealRuntimeUnavailable(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot: t.TempDir(),
		ProjectState:  projectRuntime,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", false)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting without runtime: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected reveal_ui_setting without runtime to fail")
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "internal_error" {
		t.Fatalf("expected internal_error code, got %#v", payload["code"])
	}
	if payload["message"] != "UI setting reveal runtime is unavailable." {
		t.Fatalf("expected unavailable message, got %#v", payload["message"])
	}
}

func TestServerRevealUISettingUsesRequestMetaProjectAndSectionWhenSessionMissing(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustCloneScopedTestProject(t, projectRuntime, "project-beta", "project-alpha")

	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:          "request-meta-project",
			ProjectConfigID:    "project-beta",
			DurationMS:         1500,
			EmittedRevealCount: 1,
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "revealed",
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithBackendWatchCodeSettingsAndOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-beta",
			"sectionId":       "chat-section",
		},
		Arguments: map[string]any{
			"settingId":           "core.project.show_param_display_names",
			"sectionIdToActivate": "allowed-callable-section",
			"durationMs":          1500,
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting with request-meta project/section context: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting with request-meta project/section context success, got %#v", result.StructuredContent)
	}

	if revealService.input.ProjectConfigID != "project-beta" {
		t.Fatalf("expected request-meta projectConfigId project-beta, got %q", revealService.input.ProjectConfigID)
	}
	if revealService.input.ContextSectionID != "chat-section" {
		t.Fatalf("expected request-meta sectionId chat-section, got %q", revealService.input.ContextSectionID)
	}
	if revealService.input.SectionIDToActivate != "allowed-callable-section" {
		t.Fatalf("expected explicit section override allowed-callable-section, got %q", revealService.input.SectionIDToActivate)
	}
}

func TestServerRevealUISettingDefaultsProjectAndSectionFromAgenticContext(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustCloneScopedTestProject(t, projectRuntime, "project-beta", "project-alpha")

	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:          "request-agentic-project",
			ProjectConfigID:    "project-beta",
			DurationMS:         1500,
			EmittedRevealCount: 1,
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "revealed",
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithBackendWatchCodeSettingsAndOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-beta", "chat-1", "chat-section", false)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Arguments: map[string]any{
			"settingId":  "core.project.show_param_display_names",
			"durationMs": 1500,
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting with agentic-context defaults: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting with agentic-context defaults success, got %#v", result.StructuredContent)
	}

	if revealService.input.ProjectConfigID != "project-beta" {
		t.Fatalf("expected agentic-context projectConfigId project-beta, got %q", revealService.input.ProjectConfigID)
	}
	if revealService.input.ContextSectionID != "chat-section" {
		t.Fatalf("expected agentic-context sectionId chat-section, got %q", revealService.input.ContextSectionID)
	}
	if revealService.input.SectionIDToActivate != "" {
		t.Fatalf("expected no explicit section override, got %q", revealService.input.SectionIDToActivate)
	}
}

func TestServerRevealUISettingForwardsShareSessionID(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:       "request-1",
			ProjectConfigID: "project-alpha",
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "failed",
					Error: &uisettings.SettingError{
						Code:    uisettings.ErrorCodeMutationFailed,
						Message: "expected test failure",
					},
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithBackendWatchCodeSettingsAndOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContextWithShareSession(
		t,
		clientSession,
		"project-alpha",
		"chat-1",
		"chat-section",
		"share-session-1",
		false,
	)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting success, got %#v", result.StructuredContent)
	}
	if revealService.input.ShareSessionID != "share-session-1" {
		t.Fatalf("expected shareSessionID share-session-1, got %q", revealService.input.ShareSessionID)
	}
}

func TestServerRevealUISettingPrefersSessionShareSessionIDOverRequestMeta(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:       "request-1",
			ProjectConfigID: "project-alpha",
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "revealed",
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithBackendWatchCodeSettingsAndOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContextWithShareSession(
		t,
		clientSession,
		"project-alpha",
		"chat-1",
		"chat-section",
		"share-session-from-context",
		false,
	)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Meta: sdkmcp.Meta{
			"shareSessionId": "share-session-from-request",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting with conflicting shareSessionId meta: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting success, got %#v", result.StructuredContent)
	}
	if revealService.input.ShareSessionID != "share-session-from-context" {
		t.Fatalf("expected session shareSessionID, got %q", revealService.input.ShareSessionID)
	}
}

func TestServerRevealUISettingIgnoresRequestMetaShareSessionIDWithoutSessionShareScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:       "request-1",
			ProjectConfigID: "project-alpha",
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "revealed",
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithBackendWatchCodeSettingsAndOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", false)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Meta: sdkmcp.Meta{
			"shareSessionId":        "share-session-from-request",
			"frontendAffinityToken": "frontend-from-request",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting with request shareSessionId: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting success, got %#v", result.StructuredContent)
	}
	if revealService.input.ShareSessionID != "" {
		t.Fatalf("expected request shareSessionId to be ignored, got %q", revealService.input.ShareSessionID)
	}
	if revealService.input.FrontendAffinityToken != "frontend-from-request" {
		t.Fatalf("expected request frontend affinity token to be preserved, got %q", revealService.input.FrontendAffinityToken)
	}
}

func TestServerRevealUISettingShareScopeKeepsRequestMetaFrontendAffinityWhenSessionAffinityMissing(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:       "request-1",
			ProjectConfigID: "project-alpha",
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "revealed",
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithBackendWatchCodeSettingsAndOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContextWithShareSession(
		t,
		clientSession,
		"project-alpha",
		"",
		"",
		"share-session-1",
		true,
	)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Meta: sdkmcp.Meta{
			"frontendAffinityToken": "frontend-from-request",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
		},
	})
	if err != nil {
		t.Fatalf("call share-scope reveal_ui_setting with request frontend affinity: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected share-scope reveal_ui_setting success, got %#v", result.StructuredContent)
	}
	if revealService.input.ShareSessionID != "share-session-1" {
		t.Fatalf("expected shareSessionID share-session-1, got %q", revealService.input.ShareSessionID)
	}
	if revealService.input.FrontendAffinityToken != "frontend-from-request" {
		t.Fatalf("expected request frontend affinity token in share scope, got %q", revealService.input.FrontendAffinityToken)
	}
}

func TestServerRevealUISettingShareScopePrefersAgenticFrontendAffinityTokenOverRequestMeta(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:       "request-1",
			ProjectConfigID: "project-alpha",
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "revealed",
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContextWithShareSessionAndFrontendAffinity(
		t,
		clientSession,
		"project-alpha",
		"chat-1",
		"chat-section",
		"share-session-1",
		"frontend-from-context",
		false,
	)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Meta: sdkmcp.Meta{
			"frontendAffinityToken": "frontend-from-request",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting success, got %#v", result.StructuredContent)
	}
	if revealService.input.ShareSessionID != "share-session-1" {
		t.Fatalf("expected shareSessionID share-session-1, got %q", revealService.input.ShareSessionID)
	}
	if revealService.input.FrontendAffinityToken != "frontend-from-context" {
		t.Fatalf("expected session frontend affinity token, got %q", revealService.input.FrontendAffinityToken)
	}
}

func TestServerRevealUISettingPrefersSessionSectionContextOverRequestMeta(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:       "request-1",
			ProjectConfigID: "project-alpha",
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "revealed",
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", false)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Meta: sdkmcp.Meta{
			"sectionId": "missing-section",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting with conflicting sectionId meta: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting success, got %#v", result.StructuredContent)
	}
	if revealService.input.ContextSectionID != "chat-section" {
		t.Fatalf("expected session sectionId chat-section, got %q", revealService.input.ContextSectionID)
	}
}

func TestServerRevealUISettingShareScopeIgnoresMalformedMetaFrontendAffinityWhenAgenticAffinityExists(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:       "request-1",
			ProjectConfigID: "project-alpha",
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "revealed",
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContextWithShareSessionAndFrontendAffinity(
		t,
		clientSession,
		"project-alpha",
		"chat-1",
		"chat-section",
		"share-session-1",
		"frontend-from-context",
		false,
	)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Meta: sdkmcp.Meta{
			"frontendAffinityToken": []any{"frontend-from-request"},
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting success, got %#v", result.StructuredContent)
	}
	if revealService.input.FrontendAffinityToken != "frontend-from-context" {
		t.Fatalf("expected session frontend affinity token, got %q", revealService.input.FrontendAffinityToken)
	}
}

func TestServerRevealUISettingShareScopeIgnoresMalformedMetaFrontendAffinityWhenSessionAffinityMissing(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:       "request-1",
			ProjectConfigID: "project-alpha",
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "revealed",
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContextWithShareSession(
		t,
		clientSession,
		"project-alpha",
		"",
		"",
		"share-session-1",
		true,
	)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Meta: sdkmcp.Meta{
			"frontendAffinityToken": []any{"frontend-from-request"},
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
		},
	})
	if err != nil {
		t.Fatalf("call reveal_ui_setting: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected reveal_ui_setting success, got %#v", result.StructuredContent)
	}
	if revealService.input.ShareSessionID != "share-session-1" {
		t.Fatalf("expected shareSessionID share-session-1, got %q", revealService.input.ShareSessionID)
	}
	if revealService.input.FrontendAffinityToken != "" {
		t.Fatalf("expected malformed request frontend affinity token to be ignored, got %q", revealService.input.FrontendAffinityToken)
	}
}

func TestServerSearchUISettingsReturnsRankedWatchCodePluginResults(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSessionWithBackendWatchCodeSettings(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", false)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "watch files",
			"limit":           3,
			"sourceFilter":    "plugin",
		},
	})
	if err != nil {
		t.Fatalf("call search_ui_settings: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected search_ui_settings success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	results := mustStructuredList(t, payload["results"])
	if len(results) == 0 {
		t.Fatal("expected ranked UI setting results")
	}
	first := mustStructuredMap(t, results[0])
	if first["settingId"] != "plugin::setta-fixture-watch-code-provider::files" {
		t.Fatalf("expected top result plugin::setta-fixture-watch-code-provider::files, got %#v", first)
	}
	if first["source"] != "plugin" {
		t.Fatalf("expected plugin-sourced watch-code setting, got %#v", first)
	}

	coreOnly, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "watch files",
			"sourceFilter":    "core",
		},
	})
	if err != nil {
		t.Fatalf("call core-only search_ui_settings: %v", err)
	}
	if coreOnly.IsError {
		t.Fatalf("expected core-only search_ui_settings success, got %#v", coreOnly.StructuredContent)
	}
	corePayload := mustStructuredMap(t, coreOnly.StructuredContent)
	for _, rawResult := range mustStructuredList(t, corePayload["results"]) {
		resultMap := mustStructuredMap(t, rawResult)
		if resultMap["settingId"] == "plugin::setta-fixture-watch-code-provider::files" {
			t.Fatalf("expected no core watch-code UI setting results, got %#v", corePayload["results"])
		}
	}
}

func TestServerSearchUISettingsRejectsBlankQuery(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", false)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "   ",
		},
	})
	if err != nil {
		t.Fatalf("call blank search_ui_settings: %v", err)
	}
	if !result.IsError {
		t.Fatalf("expected blank search_ui_settings to fail, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if payload["message"] != "query must not be empty" {
		t.Fatalf("expected blank-query message, got %#v", payload["message"])
	}
}

func TestServerGetUISettingValueRejectsMalformedProjectConfigIDMetaWithoutFallbackToArgument(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Meta: sdkmcp.Meta{
			"projectConfigId": 123,
			"sectionId":       "chat-section",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-watch-code-provider::files",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value with malformed projectConfigId meta: %v", err)
	}
	if !result.IsError {
		t.Fatalf("expected malformed projectConfigId meta to fail, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if payload["message"] != "projectConfigId metadata must be a string" {
		t.Fatalf("expected malformed projectConfigId meta message, got %#v", payload["message"])
	}
}

func TestServerGetUISettingValueRejectsMalformedAllowUnscopedMetaWithoutFallbackToProjectArgument(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   "sometimes",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-watch-code-provider::files",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value with malformed allowUnscoped meta: %v", err)
	}
	if !result.IsError {
		t.Fatalf("expected malformed allowUnscoped meta to fail, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if payload["message"] != "allowUnscoped metadata must be true or false" {
		t.Fatalf("expected malformed allowUnscoped meta message, got %#v", payload["message"])
	}
}

func TestServerUISettingToolsDefaultProjectConfigIDFromAgenticContext(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSessionWithBackendWatchCodeSettings(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	searchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"query": "watch files",
			"limit": 3,
		},
	})
	if err != nil {
		t.Fatalf("call search_ui_settings without projectConfigId: %v", err)
	}
	if searchResult.IsError {
		t.Fatalf("expected search_ui_settings without projectConfigId success, got %#v", searchResult.StructuredContent)
	}
	searchPayload := mustStructuredMap(t, searchResult.StructuredContent)
	searchResults := mustStructuredList(t, searchPayload["results"])
	if len(searchResults) == 0 || mustStructuredMap(t, searchResults[0])["settingId"] != "plugin::setta-fixture-watch-code-provider::files" {
		t.Fatalf("expected watch-code search result without projectConfigId, got %#v", searchResults)
	}

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"settingId": "core.project.name",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value without projectConfigId: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected get_ui_setting_value without projectConfigId success, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	if getPayload["value"] != "Alpha" {
		t.Fatalf("expected project name Alpha, got %#v", getPayload["value"])
	}

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"settingId": "core.project.show_param_display_names",
			"value":     true,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value without projectConfigId: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected set_ui_setting_value without projectConfigId success, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	if setPayload["changed"] != true {
		t.Fatalf("expected changed=true, got %#v", setPayload["changed"])
	}
}

func TestServerUISettingToolsPreferSessionProjectConfigIDOverRequestMeta(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSessionWithBackendWatchCodeSettings(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Meta: sdkmcp.Meta{
			"projectConfigId": "missing-project",
		},
		Arguments: map[string]any{
			"query": "watch files",
			"limit": 3,
		},
	})
	if err != nil {
		t.Fatalf("call search_ui_settings with conflicting projectConfigId meta: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected session projectConfigId to stay authoritative, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	results := mustStructuredList(t, payload["results"])
	if len(results) == 0 || mustStructuredMap(t, results[0])["settingId"] != "plugin::setta-fixture-watch-code-provider::files" {
		t.Fatalf("expected watch-code search result, got %#v", results)
	}
}

func TestServerUISettingToolsRejectProjectArgumentMismatchingAgenticContext(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustCloneScopedTestProject(t, projectRuntime, "project-beta", "project-alpha")

	testCases := []struct {
		name          string
		toolName      string
		arguments     map[string]any
		revealService *recordingRevealService
	}{
		{
			name:     "search",
			toolName: "search_ui_settings",
			arguments: map[string]any{
				"projectConfigId": "project-beta",
				"query":           "watch code",
			},
		},
		{
			name:     "get",
			toolName: "get_ui_setting_value",
			arguments: map[string]any{
				"projectConfigId": "project-beta",
				"settingId":       "plugin::setta-fixture-watch-code-provider::files",
			},
		},
		{
			name:     "set",
			toolName: "set_ui_setting_value",
			arguments: map[string]any{
				"projectConfigId": "project-beta",
				"settingId":       "plugin::setta-fixture-watch-code-provider::files",
				"value":           []any{"pkg/watch.py"},
			},
		},
		{
			name:     "reveal",
			toolName: "reveal_ui_setting",
			arguments: map[string]any{
				"projectConfigId": "project-beta",
				"settingId":       "core.project.show_param_display_names",
			},
			revealService: &recordingRevealService{
				result: uisettings.RevealResult{
					RequestID:       "unexpected",
					ProjectConfigID: "project-alpha",
					Statuses: []uisettings.RevealStatus{
						{SettingID: "core.project.show_param_display_names", Status: "revealed"},
					},
				},
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
				WorkspaceRoot:    t.TempDir(),
				ProjectState:     projectRuntime,
				UISettingReveals: tc.revealService,
			})
			defer clientSession.Close()

			setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

			beforeSnapshot := projectRuntime.Snapshot()
			if _, err := beforeSnapshot.Document.ProjectByID("project-alpha"); err != nil {
				t.Fatalf("project-alpha before mismatched UI-setting call: %v", err)
			}
			if _, err := beforeSnapshot.Document.ProjectByID("project-beta"); err != nil {
				t.Fatalf("project-beta before mismatched UI-setting call: %v", err)
			}
			beforeAlpha := readScopedTestWatchCodeProjectData(t, beforeSnapshot.Document, "project-alpha")
			beforeBeta := readScopedTestWatchCodeProjectData(t, beforeSnapshot.Document, "project-beta")

			result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
				Name:      tc.toolName,
				Arguments: tc.arguments,
			})
			if err != nil {
				t.Fatalf("call %s with mismatched projectConfigId: %v", tc.toolName, err)
			}
			if !result.IsError {
				t.Fatalf("expected %s with mismatched projectConfigId to fail, got %#v", tc.toolName, result.StructuredContent)
			}

			payload := mustStructuredMap(t, result.StructuredContent)
			if payload["code"] != "invalid_arguments" {
				t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
			}
			message, _ := payload["message"].(string)
			if !strings.Contains(message, "projectConfigId argument") || !strings.Contains(message, "does not match agentic context projectConfigId") {
				t.Fatalf("expected project mismatch message, got %#v", payload["message"])
			}

			afterSnapshot := projectRuntime.Snapshot()
			if _, err := afterSnapshot.Document.ProjectByID("project-alpha"); err != nil {
				t.Fatalf("project-alpha after mismatched UI-setting call: %v", err)
			}
			if _, err := afterSnapshot.Document.ProjectByID("project-beta"); err != nil {
				t.Fatalf("project-beta after mismatched UI-setting call: %v", err)
			}
			afterAlpha := readScopedTestWatchCodeProjectData(t, afterSnapshot.Document, "project-alpha")
			afterBeta := readScopedTestWatchCodeProjectData(t, afterSnapshot.Document, "project-beta")
			if !reflect.DeepEqual(beforeAlpha.Files, afterAlpha.Files) || !reflect.DeepEqual(beforeAlpha.Folders, afterAlpha.Folders) {
				t.Fatalf("expected project-alpha Watch Code inputs to remain unchanged, before=%#v after=%#v", beforeAlpha, afterAlpha)
			}
			if !reflect.DeepEqual(beforeBeta.Files, afterBeta.Files) || !reflect.DeepEqual(beforeBeta.Folders, afterBeta.Folders) {
				t.Fatalf("expected project-beta Watch Code inputs to remain unchanged, before=%#v after=%#v", beforeBeta, afterBeta)
			}
			if tc.revealService != nil && tc.revealService.input.ProjectConfigID != "" {
				t.Fatalf("expected reveal service not to be invoked on project mismatch, got %#v", tc.revealService.input)
			}
		})
	}
}

func TestServerGetUISettingValueRejectsProjectArgumentMismatchInShareSession(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustCloneScopedTestProject(t, projectRuntime, "project-beta", "project-alpha")

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot: t.TempDir(),
		ProjectState:  projectRuntime,
	})
	defer clientSession.Close()

	setUISettingAgenticContextWithShareSession(
		t,
		clientSession,
		"project-alpha",
		"chat-1",
		"chat-section",
		"share-session-1",
		true,
	)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-beta",
			"settingId":       "plugin::setta-fixture-watch-code-provider::files",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value with mismatched share-session projectConfigId: %v", err)
	}
	if !result.IsError {
		t.Fatalf("expected get_ui_setting_value with mismatched share-session projectConfigId to fail, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	message, _ := payload["message"].(string)
	if !strings.Contains(message, "projectConfigId argument") || !strings.Contains(message, "does not match agentic context projectConfigId") {
		t.Fatalf("expected project mismatch message, got %#v", payload["message"])
	}
}

func TestServerUISettingToolsRoundTripProjectNameAndPythonCodegenEnabled(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	searchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "project name",
			"limit":           5,
		},
	})
	if err != nil {
		t.Fatalf("call search_ui_settings for project name: %v", err)
	}
	if searchResult.IsError {
		t.Fatalf("expected search_ui_settings success, got %#v", searchResult.StructuredContent)
	}
	searchPayload := mustStructuredMap(t, searchResult.StructuredContent)
	searchResults := mustStructuredList(t, searchPayload["results"])
	if len(searchResults) == 0 || mustStructuredMap(t, searchResults[0])["settingId"] != "core.project.name" {
		t.Fatalf("expected project-name search result, got %#v", searchResults)
	}

	projectNameResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.name",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value for project name: %v", err)
	}
	if projectNameResult.IsError {
		t.Fatalf("expected project name read success, got %#v", projectNameResult.StructuredContent)
	}
	projectNamePayload := mustStructuredMap(t, projectNameResult.StructuredContent)
	if projectNamePayload["value"] != "Alpha" {
		t.Fatalf("expected project name Alpha, got %#v", projectNamePayload["value"])
	}

	setProjectNameResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.name",
			"value":           "Renamed Project",
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value for project name: %v", err)
	}
	if setProjectNameResult.IsError {
		t.Fatalf("expected project name write success, got %#v", setProjectNameResult.StructuredContent)
	}
	setProjectNamePayload := mustStructuredMap(t, setProjectNameResult.StructuredContent)
	if setProjectNamePayload["changed"] != true {
		t.Fatalf("expected project name changed=true, got %#v", setProjectNamePayload["changed"])
	}

	pythonCodegenResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.run_instructions.python_codegen_enabled",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value for python codegen enabled: %v", err)
	}
	if pythonCodegenResult.IsError {
		t.Fatalf("expected python codegen read success, got %#v", pythonCodegenResult.StructuredContent)
	}
	pythonCodegenPayload := mustStructuredMap(t, pythonCodegenResult.StructuredContent)
	if pythonCodegenPayload["value"] != false {
		t.Fatalf("expected python codegen disabled, got %#v", pythonCodegenPayload["value"])
	}

	setPythonCodegenResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.run_instructions.python_codegen_enabled",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value for python codegen enabled: %v", err)
	}
	if setPythonCodegenResult.IsError {
		t.Fatalf("expected python codegen write success, got %#v", setPythonCodegenResult.StructuredContent)
	}
	setPythonCodegenPayload := mustStructuredMap(t, setPythonCodegenResult.StructuredContent)
	if setPythonCodegenPayload["changed"] != true {
		t.Fatalf("expected python codegen changed=true, got %#v", setPythonCodegenPayload["changed"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after UI setting writes: %v", err)
	}
	if project.Name != "Renamed Project" {
		t.Fatalf("expected persisted project name Renamed Project, got %#v", project.Name)
	}
	if !project.HasPythonCodegenTarget() {
		t.Fatal("expected python codegen target to be enabled after UI setting write")
	}
}

func TestServerUISettingToolsRejectMissingScopedProjectContextWhenProjectIDOmitted(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"settingId": "core.project.name",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value without scoped project context: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected missing scoped project context to return structured tool error")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != scopeViolationErrorCode {
		t.Fatalf("expected scope violation code, got %#v", payload["code"])
	}
	if payload["reason"] != "missing_context" {
		t.Fatalf("expected missing_context reason, got %#v", payload["reason"])
	}
}

func TestServerGetUISettingValueReturnsStructuredPayload(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", false)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.name",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected get_ui_setting_value success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	setting := mustStructuredMap(t, payload["setting"])
	if setting["settingId"] != "core.project.name" {
		t.Fatalf("expected core.project.name summary, got %#v", setting)
	}
	if payload["value"] != "Alpha" {
		t.Fatalf("expected project name Alpha, got %#v", payload["value"])
	}
	if _, ok := payload["error"]; ok {
		t.Fatalf("did not expect structured error, got %#v", payload["error"])
	}
}

func TestServerSetUISettingValueWritesAndValidates(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSessionWithBackendWatchCodeSettings(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_ui_setting_value success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["changed"] != true {
		t.Fatalf("expected changed=true, got %#v", payload["changed"])
	}
	if payload["oldValue"] != false {
		t.Fatalf("expected oldValue=false, got %#v", payload["oldValue"])
	}
	if payload["newValue"] != true {
		t.Fatalf("expected newValue=true, got %#v", payload["newValue"])
	}
	if _, ok := payload["error"]; ok {
		t.Fatalf("did not expect structured error, got %#v", payload["error"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_ui_setting_value: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected showParamDisplayNames to be persisted")
	}

	invalidResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-watch-code-provider::folders",
			"value": []any{
				map[string]any{
					"path":      "./backend",
					"recursive": "nope",
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("call invalid set_ui_setting_value: %v", err)
	}
	if invalidResult.IsError {
		t.Fatalf("expected structured invalid set_ui_setting_value failure, got %#v", invalidResult.StructuredContent)
	}

	invalidPayload := mustStructuredMap(t, invalidResult.StructuredContent)
	errorPayload := mustStructuredMap(t, invalidPayload["error"])
	if errorPayload["code"] != string(uisettings.ErrorCodeInvalidValueType) {
		t.Fatalf("expected invalid_value_type error code, got %#v", errorPayload["code"])
	}
}

func TestServerSetUISettingValueRejectsUnsupportedWatchCodeFolderPropertiesWithoutMutation(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSessionWithBackendWatchCodeSettings(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	initialResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-watch-code-provider::folders",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value before invalid watch folders write: %v", err)
	}
	if initialResult.IsError {
		t.Fatalf("expected initial get_ui_setting_value success, got %#v", initialResult.StructuredContent)
	}
	initialPayload := mustStructuredMap(t, initialResult.StructuredContent)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-watch-code-provider::folders",
			"value": []any{
				map[string]any{
					"path":      "./backend",
					"recursive": true,
					"extra":     "not-allowed",
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value with unsupported watch folder properties: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected structured unsupported-property failure, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["changed"] != false {
		t.Fatalf("expected changed=false, got %#v", payload["changed"])
	}
	errorPayload := mustStructuredMap(t, payload["error"])
	if errorPayload["code"] != string(uisettings.ErrorCodeInvalidValueType) {
		t.Fatalf("expected invalid_value_type error code, got %#v", errorPayload["code"])
	}
	if !strings.Contains(fmt.Sprint(errorPayload["message"]), "unsupported properties") {
		t.Fatalf("expected unsupported-properties message, got %#v", errorPayload["message"])
	}

	unchangedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-watch-code-provider::folders",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value after invalid watch folders write: %v", err)
	}
	if unchangedResult.IsError {
		t.Fatalf("expected unchanged get_ui_setting_value success, got %#v", unchangedResult.StructuredContent)
	}
	unchangedPayload := mustStructuredMap(t, unchangedResult.StructuredContent)
	if !reflect.DeepEqual(unchangedPayload["value"], initialPayload["value"]) {
		t.Fatalf("expected watch code folders to remain unchanged, got before=%#v after=%#v", initialPayload["value"], unchangedPayload["value"])
	}
}

func TestServerSetUISettingValueDefaultsProjectConfigIDFromShareScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:          "share-request",
			ProjectConfigID:    "project-alpha",
			EmittedRevealCount: 1,
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "plugin::setta-fixture-watch-code-provider::files",
					Status:    "revealed",
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithBackendWatchCodeSettingsAndOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContextWithShareSessionAndFrontendAffinity(
		t,
		clientSession,
		"project-alpha",
		"",
		"",
		"share-session-1",
		"frontend-from-context",
		true,
	)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Meta: sdkmcp.Meta{
			"frontendAffinityToken": "frontend-from-request",
		},
		Arguments: map[string]any{
			"settingId":      "plugin::setta-fixture-watch-code-provider::files",
			"value":          []any{"pkg/share.py"},
			"revealAfterSet": true,
		},
	})
	if err != nil {
		t.Fatalf("call share-scope set_ui_setting_value without projectConfigId: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected share-scope set_ui_setting_value without projectConfigId success, got %#v", result.StructuredContent)
	}
	if revealService.input.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected projectConfigID project-alpha, got %q", revealService.input.ProjectConfigID)
	}
	if revealService.input.ShareSessionID != "share-session-1" {
		t.Fatalf("expected shareSessionID share-session-1, got %q", revealService.input.ShareSessionID)
	}
}

func TestServerSetUISettingValueForwardsExpectedOldValue(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	successResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId":  "project-alpha",
			"settingId":        "core.project.show_param_display_names",
			"value":            true,
			"expectedOldValue": false,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value with matching expectedOldValue: %v", err)
	}
	if successResult.IsError {
		t.Fatalf("expected set_ui_setting_value success with matching expectedOldValue, got %#v", successResult.StructuredContent)
	}

	successPayload := mustStructuredMap(t, successResult.StructuredContent)
	if successPayload["changed"] != true {
		t.Fatalf("expected changed=true, got %#v", successPayload["changed"])
	}

	staleResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId":  "project-alpha",
			"settingId":        "core.project.show_param_display_names",
			"value":            false,
			"expectedOldValue": false,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value with stale expectedOldValue: %v", err)
	}
	if staleResult.IsError {
		t.Fatalf("expected structured stale expectedOldValue failure, got %#v", staleResult.StructuredContent)
	}

	stalePayload := mustStructuredMap(t, staleResult.StructuredContent)
	errorPayload := mustStructuredMap(t, stalePayload["error"])
	if errorPayload["code"] != string(uisettings.ErrorCodeMutationFailed) {
		t.Fatalf("expected mutation_failed error code, got %#v", errorPayload["code"])
	}
}

func TestServerSetUISettingValueSuppliesCurrentValueWhenExpectedOldValueOmitted(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	recordingState := &expectedOldValueRecordingProjectState{Runtime: projectRuntime}
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot: t.TempDir(),
		ProjectState:  recordingState,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	firstResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value without expectedOldValue for first write: %v", err)
	}
	if firstResult.IsError {
		t.Fatalf("expected first set_ui_setting_value success, got %#v", firstResult.StructuredContent)
	}

	secondResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
			"value":           false,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value without expectedOldValue for second write: %v", err)
	}
	if secondResult.IsError {
		t.Fatalf("expected second set_ui_setting_value success, got %#v", secondResult.StructuredContent)
	}

	if len(recordingState.observedShowParamExpectedOldValues) != 2 {
		t.Fatalf("expected two observed expectedOldValue calls, got %d", len(recordingState.observedShowParamExpectedOldValues))
	}
	if recordingState.observedShowParamExpectedOldValues[0] == nil || *recordingState.observedShowParamExpectedOldValues[0] != false {
		t.Fatalf("expected first omitted expectedOldValue to use current false value, got %#v", recordingState.observedShowParamExpectedOldValues[0])
	}
	if recordingState.observedShowParamExpectedOldValues[1] == nil || *recordingState.observedShowParamExpectedOldValues[1] != true {
		t.Fatalf("expected second omitted expectedOldValue to use refreshed true value, got %#v", recordingState.observedShowParamExpectedOldValues[1])
	}
}

func TestServerSetUISettingValueRejectsStaleProjectNamePreconditionWithoutClobber(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	projectState := &concurrentCoreSettingProjectState{Runtime: projectRuntime}
	projectState.beforeCompareProjectName = func(ctx context.Context, projectID string, _ string, _ *string) error {
		_, err := projectRuntime.SetProjectName(ctx, projectID, "Alpha Concurrent")
		return err
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot: t.TempDir(),
		ProjectState:  projectState,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.name",
			"value":           "Alpha",
		},
	})
	if err != nil {
		t.Fatalf("call stale project-name set_ui_setting_value: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected structured stale project-name response, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	errorPayload := mustStructuredMap(t, payload["error"])
	if errorPayload["code"] != string(uisettings.ErrorCodeMutationFailed) {
		t.Fatalf("expected mutation_failed error code, got %#v", errorPayload["code"])
	}
	if !strings.Contains(fmt.Sprint(errorPayload["message"]), "changed since pre-write validation") {
		t.Fatalf("expected stale-precondition message, got %#v", errorPayload["message"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after stale project-name write: %v", err)
	}
	if project.Name != "Alpha Concurrent" {
		t.Fatalf("expected concurrent project name to remain, got %q", project.Name)
	}
}

func TestServerSetUISettingValueRejectsStalePythonCodegenPreconditionWithoutClobber(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	projectState := &concurrentCoreSettingProjectState{Runtime: projectRuntime}
	projectState.beforeComparePythonCodegenEnabled = func(ctx context.Context, projectID string, _ bool, _ *bool) error {
		_, err := projectRuntime.SetProjectCodegenTargets(
			ctx,
			projectID,
			[]projectstate.ProjectCodegenTarget{{Language: string(projectstate.CodeLanguagePython)}},
			nil,
			projectstate.PythonCodegenSectionReconcilerFunc(func(context.Context, *projectstate.Project) error {
				return nil
			}),
		)
		return err
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot: t.TempDir(),
		ProjectState:  projectState,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.run_instructions.python_codegen_enabled",
			"value":           false,
		},
	})
	if err != nil {
		t.Fatalf("call stale python-codegen set_ui_setting_value: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected structured stale python-codegen response, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	errorPayload := mustStructuredMap(t, payload["error"])
	if errorPayload["code"] != string(uisettings.ErrorCodeMutationFailed) {
		t.Fatalf("expected mutation_failed error code, got %#v", errorPayload["code"])
	}
	if !strings.Contains(fmt.Sprint(errorPayload["message"]), "changed since pre-write validation") {
		t.Fatalf("expected stale-precondition message, got %#v", errorPayload["message"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after stale python-codegen write: %v", err)
	}
	if !project.HasPythonCodegenTarget() {
		t.Fatal("expected concurrent python codegen value to remain enabled")
	}
}

func TestServerSetUISettingValueRevealAfterSetReturnsNestedRevealAndUsesMetaSectionContext(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:          "request-reveal-after-set",
			ProjectConfigID:    "project-alpha",
			DurationMS:         1500,
			EmittedRevealCount: 1,
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "revealed",
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "", "", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Meta: sdkmcp.Meta{
			"sectionId": "allowed-callable-section",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
			"value":           true,
			"revealAfterSet":  true,
			"durationMs":      1500,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value with revealAfterSet: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_ui_setting_value with revealAfterSet success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["changed"] != true {
		t.Fatalf("expected changed=true, got %#v", payload["changed"])
	}
	revealPayload := mustStructuredMap(t, payload["reveal"])
	if revealPayload["requestId"] != "request-reveal-after-set" {
		t.Fatalf("expected nested reveal request id, got %#v", revealPayload["requestId"])
	}
	if revealService.input.ContextSectionID != "allowed-callable-section" {
		t.Fatalf("expected request-meta section context to be reused, got %q", revealService.input.ContextSectionID)
	}
	if revealService.input.SectionIDToActivate != "" {
		t.Fatalf("expected no explicit section override, got %q", revealService.input.SectionIDToActivate)
	}
	if revealService.input.DurationMS != 1500 {
		t.Fatalf("expected reveal duration 1500, got %d", revealService.input.DurationMS)
	}
}

func TestServerSetUISettingValueRevealAfterSetShareScopePrefersAgenticFrontendAffinityTokenOverRequestMeta(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:          "request-reveal-after-set",
			ProjectConfigID:    "project-alpha",
			EmittedRevealCount: 1,
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "plugin::setta-fixture-watch-code-provider::files",
					Status:    "revealed",
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithBackendWatchCodeSettingsAndOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContextWithShareSessionAndFrontendAffinity(
		t,
		clientSession,
		"project-alpha",
		"",
		"",
		"share-session-1",
		"frontend-from-context",
		true,
	)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Meta: sdkmcp.Meta{
			"frontendAffinityToken": "frontend-from-request",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-watch-code-provider::files",
			"value":           []any{"pkg/reveal.py"},
			"revealAfterSet":  true,
		},
	})
	if err != nil {
		t.Fatalf("call share-scope set_ui_setting_value with revealAfterSet: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected share-scope set_ui_setting_value with revealAfterSet success, got %#v", result.StructuredContent)
	}
	if revealService.input.ShareSessionID != "share-session-1" {
		t.Fatalf("expected shareSessionID share-session-1, got %q", revealService.input.ShareSessionID)
	}
	if revealService.input.FrontendAffinityToken != "frontend-from-context" {
		t.Fatalf("expected session frontend affinity token, got %q", revealService.input.FrontendAffinityToken)
	}
}

func TestServerSetUISettingValueRevealAfterSetPreservesWriteWhenRevealFails(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:       "request-reveal-failure",
			ProjectConfigID: "project-alpha",
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "failed",
					Error: &uisettings.SettingError{
						Code:    uisettings.ErrorCodeMutationFailed,
						Message: "expected reveal failure",
					},
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "", "", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Meta: sdkmcp.Meta{
			"sectionId": "allowed-callable-section",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
			"value":           true,
			"revealAfterSet":  true,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value with revealAfterSet failure: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_ui_setting_value with revealAfterSet failure to keep write result, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["changed"] != true {
		t.Fatalf("expected changed=true, got %#v", payload["changed"])
	}
	if _, ok := payload["error"]; ok {
		t.Fatalf("did not expect top-level write error, got %#v", payload["error"])
	}
	revealPayload := mustStructuredMap(t, payload["reveal"])
	statuses := mustStructuredList(t, revealPayload["statuses"])
	status := mustStructuredMap(t, statuses[0])
	if status["status"] != "failed" {
		t.Fatalf("expected nested reveal failure, got %#v", status["status"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after reveal failure: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected write to persist even when nested reveal fails")
	}
}

func TestServerSetUISettingValueRevealAfterSetPreservesWriteWhenFrontendDispatchFails(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	registry := realtime.NewRegistry(realtime.RegistryOptions{})
	if _, err := registry.Register(realtime.RegisterParams{ID: "frontend-1", Type: realtime.ConnectionTypeFrontend}); err != nil {
		t.Fatalf("register frontend: %v", err)
	}
	transport := &stubUISettingRevealTransport{registry: registry}
	transport.sendJSON = func(_ context.Context, _ any, connectionID string) (bool, error) {
		if connectionID != "frontend-1" {
			t.Fatalf("expected reveal dispatch to frontend-1, got %q", connectionID)
		}
		return false, nil
	}
	revealService, err := uisettings.NewRevealService(uisettings.RevealServiceOptions{
		Transport: transport,
		Results:   realtime.NewUISettingRevealResultHub(),
	})
	if err != nil {
		t.Fatalf("new reveal service: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "", "", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Meta: sdkmcp.Meta{
			"sectionId": "allowed-callable-section",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
			"value":           true,
			"revealAfterSet":  true,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value with undeliverable revealAfterSet: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_ui_setting_value with undeliverable revealAfterSet to keep write result, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["changed"] != true {
		t.Fatalf("expected changed=true, got %#v", payload["changed"])
	}
	revealPayload := mustStructuredMap(t, payload["reveal"])
	statuses := mustStructuredList(t, revealPayload["statuses"])
	status := mustStructuredMap(t, statuses[0])
	if status["status"] != "failed" {
		t.Fatalf("expected nested reveal failure, got %#v", status["status"])
	}
	revealError := mustStructuredMap(t, status["error"])
	if revealError["message"] != "Selected frontend websocket became unavailable before reveal dispatch: frontend-1" {
		t.Fatalf("expected undeliverable dispatch message, got %#v", revealError["message"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after undeliverable reveal failure: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected write to persist even when reveal dispatch fails before delivery")
	}
}

func TestServerSetUISettingValueRevealAfterSetNoFrontendDoesNotActivateSection(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService, err := uisettings.NewRevealService(uisettings.RevealServiceOptions{
		Transport: &stubUISettingRevealTransport{registry: realtime.NewRegistry(realtime.RegistryOptions{})},
		Results:   realtime.NewUISettingRevealResultHub(),
	})
	if err != nil {
		t.Fatalf("new reveal service: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "", "", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Meta: sdkmcp.Meta{
			"sectionId": "allowed-callable-section",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
			"value":           true,
			"revealAfterSet":  true,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value with revealAfterSet and no frontend: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_ui_setting_value with no-frontend reveal failure to keep write result, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["changed"] != true {
		t.Fatalf("expected changed=true, got %#v", payload["changed"])
	}
	revealPayload := mustStructuredMap(t, payload["reveal"])
	status := mustStructuredMap(t, mustStructuredList(t, revealPayload["statuses"])[0])
	if status["status"] != "failed" {
		t.Fatalf("expected nested reveal failure, got %#v", status["status"])
	}
	revealError := mustStructuredMap(t, status["error"])
	if revealError["message"] != "No connected frontend is available for UI setting reveal." {
		t.Fatalf("unexpected no-frontend reveal message, got %#v", revealError["message"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after no-frontend reveal failure: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected write to persist even when no frontend is connected")
	}
	if len(project.ActiveIDs) != 0 {
		t.Fatalf("expected no active section mutation, got %#v", project.ActiveIDs)
	}
}

func TestServerSetUISettingValueRejectsWriterOldValueDrift(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot: t.TempDir(),
		ProjectState:  uiSettingDriftProjectState{Runtime: projectRuntime},
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "core.project.show_param_display_names",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call drift set_ui_setting_value: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected structured drift failure, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	errorPayload := mustStructuredMap(t, payload["error"])
	if errorPayload["code"] != string(uisettings.ErrorCodeMutationFailed) {
		t.Fatalf("expected mutation_failed error code, got %#v", errorPayload["code"])
	}
}

func TestServerUISettingToolsTrimSettingIDWhitespace(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:          "request-whitespace",
			ProjectConfigID:    "project-alpha",
			DurationMS:         1500,
			EmittedRevealCount: 1,
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "plugin::setta-fixture-watch-code-provider::files",
					Status:    "revealed",
					Target: &realtime.UISettingRevealTarget{
						SettingID:      "plugin::setta-fixture-watch-code-provider::files",
						Side:           "left",
						OverviewTabKey: testStringPointer("Overview"),
						Strategy:       "dom_anchor",
						AnchorID:       testStringPointer("plugin::setta-fixture-watch-code-provider::files"),
					},
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithBackendWatchCodeSettingsAndOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	paddedSettingID := "  plugin::setta-fixture-watch-code-provider::files\t"

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       paddedSettingID,
		},
	})
	if err != nil {
		t.Fatalf("call padded get_ui_setting_value: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected padded get_ui_setting_value success, got %#v", getResult.StructuredContent)
	}

	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	if value := mustStructuredList(t, getPayload["value"]); len(value) != 0 {
		t.Fatalf("expected initial watch-code files to be empty, got %#v", value)
	}

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       paddedSettingID,
			"value":           []any{"pkg/padded.py"},
		},
	})
	if err != nil {
		t.Fatalf("call padded set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected padded set_ui_setting_value success, got %#v", setResult.StructuredContent)
	}

	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	if setPayload["changed"] != true {
		t.Fatalf("expected padded set_ui_setting_value to change state, got %#v", setPayload)
	}

	revealResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       paddedSettingID,
			"durationMs":      1500,
		},
	})
	if err != nil {
		t.Fatalf("call padded reveal_ui_setting: %v", err)
	}
	if revealResult.IsError {
		t.Fatalf("expected padded reveal_ui_setting success, got %#v", revealResult.StructuredContent)
	}

	snapshot := projectRuntime.Snapshot()
	project, err := snapshot.Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after padded UI-setting writes: %v", err)
	}
	projectData := readScopedTestWatchCodeProjectData(t, snapshot.Document, project.ID)
	if !reflect.DeepEqual(projectData.Files, []string{"pkg/padded.py"}) {
		t.Fatalf("expected padded set_ui_setting_value to persist watch-code files, got %#v", projectData.Files)
	}
	if revealService.input.SettingID != "plugin::setta-fixture-watch-code-provider::files" {
		t.Fatalf("expected trimmed reveal setting id, got %q", revealService.input.SettingID)
	}
}

func TestServerUISettingToolsRejectWhitespaceOnlySettingID(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	testCases := []struct {
		name      string
		toolName  string
		arguments map[string]any
	}{
		{
			name:     "get",
			toolName: "get_ui_setting_value",
			arguments: map[string]any{
				"projectConfigId": "project-alpha",
				"settingId":       " \t ",
			},
		},
		{
			name:     "set",
			toolName: "set_ui_setting_value",
			arguments: map[string]any{
				"projectConfigId": "project-alpha",
				"settingId":       " \t ",
				"value":           true,
			},
		},
		{
			name:     "reveal",
			toolName: "reveal_ui_setting",
			arguments: map[string]any{
				"projectConfigId": "project-alpha",
				"settingId":       " \t ",
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
				Name:      tc.toolName,
				Arguments: tc.arguments,
			})
			if err != nil {
				t.Fatalf("call %s with blank setting id: %v", tc.toolName, err)
			}
			if !result.IsError {
				t.Fatalf("expected %s with blank setting id to fail, got %#v", tc.toolName, result.StructuredContent)
			}

			payload := mustStructuredMap(t, result.StructuredContent)
			if payload["code"] != "invalid_arguments" {
				t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
			}
			if payload["message"] != "settingId must not be empty" {
				t.Fatalf("expected blank setting id message, got %#v", payload["message"])
			}
		})
	}
}

func TestServerUISettingToolsTranslateTemporaryProjectIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), "temporary_id_map.json")
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
		"chat-1":        "12",
		"chat-section":  "13",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "11", "12", "13", true)

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"settingId":       "core.project.show_param_display_names",
		},
	})
	if err != nil {
		t.Fatalf("call temporary get_ui_setting_value: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected temporary get_ui_setting_value success, got %#v", getResult.StructuredContent)
	}

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"settingId":       "core.project.show_param_display_names",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call temporary set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected temporary set_ui_setting_value success, got %#v", setResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temporary set_ui_setting_value: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected temporary-id write to persist to canonical project")
	}
}

func TestServerRevealUISettingTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), "temporary_id_map.json")
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":            "11",
		"chat-1":                   "12",
		"chat-section":             "13",
		"allowed-callable-section": "14",
	})

	revealService := &recordingRevealService{
		result: uisettings.RevealResult{
			RequestID:          "request-temp",
			ProjectConfigID:    "project-alpha",
			DurationMS:         3000,
			EmittedRevealCount: 0,
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "failed",
					Error: &uisettings.SettingError{
						Code:    uisettings.ErrorCodeMutationFailed,
						Message: "test failure",
					},
				},
			},
		},
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		UISettingReveals:   revealService,
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "11", "12", "13", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Arguments: map[string]any{
			"projectConfigId":     "11",
			"settingId":           "core.project.show_param_display_names",
			"sectionIdToActivate": "14",
		},
	})
	if err != nil {
		t.Fatalf("call temporary reveal_ui_setting: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temporary reveal_ui_setting success, got %#v", result.StructuredContent)
	}

	if revealService.input.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected canonical project id, got %q", revealService.input.ProjectConfigID)
	}
	if revealService.input.SectionIDToActivate != "allowed-callable-section" {
		t.Fatalf("expected canonical section id, got %q", revealService.input.SectionIDToActivate)
	}
}

func TestServerUISettingToolsSupportSchemaBackedPluginSettings(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName:  "full",
			Version:      "0.1.0",
			StripBackend: true,
		},
	})
	if _, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	}); err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	searchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "fixture label",
			"sourceFilter":    "plugin",
		},
	})
	if err != nil {
		t.Fatalf("call plugin search_ui_settings: %v", err)
	}
	if searchResult.IsError {
		t.Fatalf("expected plugin search_ui_settings success, got %#v", searchResult.StructuredContent)
	}
	searchPayload := mustStructuredMap(t, searchResult.StructuredContent)
	searchResults := mustStructuredList(t, searchPayload["results"])
	if len(searchResults) == 0 {
		t.Fatal("expected plugin UI setting search results")
	}
	firstResult := mustStructuredMap(t, searchResults[0])
	if firstResult["settingId"] != "plugin::setta-fixture-full::label" {
		t.Fatalf("expected plugin label search result, got %#v", firstResult)
	}
	if firstResult["source"] != "plugin" {
		t.Fatalf("expected plugin search result source, got %#v", firstResult["source"])
	}

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::label",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value for plugin label: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected plugin get_ui_setting_value success, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	if getPayload["value"] != "unset" {
		t.Fatalf("expected default plugin label value, got %#v", getPayload["value"])
	}

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value for plugin enabled: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected plugin set_ui_setting_value success, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	if setPayload["oldValue"] != false || setPayload["newValue"] != true || setPayload["changed"] != true {
		t.Fatalf("expected plugin write false -> true, got %#v", setPayload)
	}

	labelSetResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::label",
			"value":           "updated",
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value for plugin label: %v", err)
	}
	if labelSetResult.IsError {
		t.Fatalf("expected plugin label set_ui_setting_value success, got %#v", labelSetResult.StructuredContent)
	}
	labelSetPayload := mustStructuredMap(t, labelSetResult.StructuredContent)
	if labelSetPayload["oldValue"] != "unset" || labelSetPayload["newValue"] != "updated" || labelSetPayload["changed"] != true {
		t.Fatalf("expected plugin label write unset -> updated, got %#v", labelSetPayload)
	}

	runtimeResponse, err := service.Runtime(plugins.RuntimeOptions{})
	if err != nil {
		t.Fatalf("plugin runtime after write: %v", err)
	}
	pluginEntry := mustFindPluginListEntry(t, runtimeResponse.List.Plugins, "setta-fixture-full")
	if pluginEntry.Config.CurrentConfig["enabled"] != true {
		t.Fatalf("expected plugin config enabled=true, got %#v", pluginEntry.Config.CurrentConfig)
	}
	if pluginEntry.Config.CurrentConfig["label"] != "updated" {
		t.Fatalf("expected plugin config label=updated, got %#v", pluginEntry.Config.CurrentConfig)
	}
}
